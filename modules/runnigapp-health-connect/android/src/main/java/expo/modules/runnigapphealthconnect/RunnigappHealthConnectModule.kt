package expo.modules.runnigapphealthconnect

import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.response.ReadRecordsResponse
import androidx.health.connect.client.time.TimeRangeFilter
import expo.modules.kotlin.Promise
import expo.modules.kotlin.activityresult.AppContextActivityResultCaller
import expo.modules.kotlin.activityresult.AppContextActivityResultContract
import expo.modules.kotlin.activityresult.AppContextActivityResultLauncher
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import java.io.Serializable
import java.time.Instant
import java.time.format.DateTimeFormatter

// READ-ONLY Health Connect reader for RunningGround.
// Reads recent RUNNING ExerciseSessionRecords and aggregates DistanceRecord over each
// session, returning the rows the JS `normalizeBridgeRun` understands. We never write.
class RunnigappHealthConnectModule : Module() {
  private val moduleScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

  // Read permissions we need: running exercise sessions + the distance samples we aggregate.
  private val requiredPermissions = setOf(
    HealthPermission.getReadPermission(ExerciseSessionRecord::class),
    HealthPermission.getReadPermission(DistanceRecord::class),
  )

  // Launcher for the Health Connect permission UI, registered via RegisterActivityContracts.
  private var permissionLauncher: AppContextActivityResultLauncher<HashSet<String>, Set<String>>? = null

  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("RunnigappHealthConnect")

    // Register the interactive Health Connect permission contract. Expo restores this on
    // activity recreation and gives us a launcher we can suspend on from readRuns.
    RegisterActivityContracts {
      permissionLauncher = registerForActivityResult(
        HealthConnectPermissionContract(),
      )
    }

    // Whether Health Connect is installed/available on this device.
    AsyncFunction("isAvailable") { promise: Promise ->
      try {
        val status = HealthConnectClient.getSdkStatus(context)
        promise.resolve(status == HealthConnectClient.SDK_AVAILABLE)
      } catch (error: Throwable) {
        Log.w(TAG, "isAvailable failed: ${error.message}")
        promise.resolve(false)
      }
    }

    // Ensure READ permission, then read the most recent running sessions with distance.
    AsyncFunction("readRuns") { options: ReadRunsOptions?, promise: Promise ->
      val limit = options?.limit ?: DEFAULT_LIMIT
      moduleScope.launch {
        try {
          readRuns(limit, promise)
        } catch (error: Throwable) {
          Log.w(TAG, "readRuns failed: ${error.message}")
          promise.reject(
            "E_HEALTH_CONNECT_READ",
            error.message ?: "Health Connect 러닝 기록을 읽는 중 오류가 발생했어요.",
            error,
          )
        }
      }
    }

    OnDestroy {
      moduleScope.cancel()
    }
  }

  private suspend fun readRuns(limit: Int, promise: Promise) {
    val status = HealthConnectClient.getSdkStatus(context)
    if (status != HealthConnectClient.SDK_AVAILABLE) {
      promise.reject(
        "E_HEALTH_CONNECT_UNAVAILABLE",
        "이 기기에서는 Health Connect를 사용할 수 없어요. 플레이스토어에서 Health Connect를 설치/업데이트해줘.",
        null,
      )
      return
    }

    val client = HealthConnectClient.getOrCreate(context)

    // 1) Make sure we have READ permission, requesting interactively if needed.
    val granted = client.permissionController.getGrantedPermissions()
    if (!granted.containsAll(requiredPermissions)) {
      val launcher = permissionLauncher
      if (launcher == null) {
        promise.reject(
          "E_HEALTH_CONNECT_NO_LAUNCHER",
          "Health Connect 권한 요청 화면을 열 수 없어요. 앱을 다시 실행한 뒤 시도해줘.",
          null,
        )
        return
      }

      // Launches the system Health Connect permission sheet and suspends until the user responds.
      val grantedAfterRequest = launcher.launch(HashSet(requiredPermissions))
      if (!grantedAfterRequest.containsAll(requiredPermissions)) {
        promise.reject(
          "E_HEALTH_CONNECT_PERMISSION_DENIED",
          "Health Connect에서 러닝/거리 읽기 권한을 허용해야 기록을 가져올 수 있어요. Health Connect 설정에서 RunningGround에 권한을 켜줘.",
          null,
        )
        return
      }
    }

    // 2) Read the most recent running sessions, newest first. Health Connect filters at the
    // record level only after fetching a page, so we paginate (capped) and keep matching
    // running sessions until we have `limit` of them, including treadmill/indoor runs.
    val targetCount = limit.coerceIn(1, MAX_LIMIT)
    val sessions = ArrayList<ExerciseSessionRecord>()
    var pageToken: String? = null
    var pagesRead = 0
    while (pagesRead < MAX_PAGES) {
      val response: ReadRecordsResponse<ExerciseSessionRecord> = client.readRecords(
        ReadRecordsRequest(
          recordType = ExerciseSessionRecord::class,
          timeRangeFilter = TimeRangeFilter.before(Instant.now()),
          ascendingOrder = false,
          pageSize = PAGE_SIZE,
          pageToken = pageToken,
        ),
      )
      sessions.addAll(response.records.filter { isRunningSession(it) })
      pagesRead += 1
      pageToken = response.pageToken
      if (sessions.size >= targetCount || pageToken == null) {
        break
      }
    }
    if (sessions.size > targetCount) {
      sessions.subList(targetCount, sessions.size).clear()
    }

    // 3) For each session aggregate distance over its time range; skip zero-distance ones.
    val runs = ArrayList<Map<String, Any>>()
    for (session in sessions) {
      val distanceMeters = aggregateDistanceMeters(client, session.startTime, session.endTime)
      if (distanceMeters == null || distanceMeters <= 0.0) {
        continue
      }

      val durationSeconds = (session.endTime.epochSecond - session.startTime.epochSecond)
        .coerceAtLeast(0)

      val run = HashMap<String, Any>()
      run["externalId"] = session.metadata.id
      run["startedAt"] = ISO_FORMATTER.format(session.startTime)
      run["endedAt"] = ISO_FORMATTER.format(session.endTime)
      run["date"] = ISO_FORMATTER.format(session.startTime)
      run["durationSeconds"] = durationSeconds.toDouble()
      run["distanceMeters"] = distanceMeters
      run["sourceLabel"] = session.metadata.dataOrigin.packageName.ifBlank { "Health Connect" }
      runs.add(run)
    }

    promise.resolve(runs)
  }

  // Both outdoor running and treadmill/indoor running count as runs for RunningGround.
  private fun isRunningSession(session: ExerciseSessionRecord): Boolean {
    return session.exerciseType == ExerciseSessionRecord.EXERCISE_TYPE_RUNNING ||
      session.exerciseType == ExerciseSessionRecord.EXERCISE_TYPE_RUNNING_TREADMILL
  }

  private suspend fun aggregateDistanceMeters(
    client: HealthConnectClient,
    start: Instant,
    end: Instant,
  ): Double? {
    if (!end.isAfter(start)) {
      return null
    }
    return try {
      val result = client.aggregate(
        AggregateRequest(
          metrics = setOf(DistanceRecord.DISTANCE_TOTAL),
          timeRangeFilter = TimeRangeFilter.between(start, end),
        ),
      )
      result[DistanceRecord.DISTANCE_TOTAL]?.inMeters
    } catch (error: Throwable) {
      Log.w(TAG, "distance aggregate failed: ${error.message}")
      null
    }
  }

  companion object {
    private const val TAG = "RGHealthConnect"
    private const val DEFAULT_LIMIT = 30
    private const val MAX_LIMIT = 1000
    // We fetch fixed-size pages and filter to running sessions client-side, paginating until we
    // have `limit` matches or run out of pages. PAGE_SIZE is generous so most requests need one
    // page; MAX_PAGES caps the worst case (lots of non-running sessions) to stay bounded.
    private const val PAGE_SIZE = 200
    private const val MAX_PAGES = 10
    private val ISO_FORMATTER: DateTimeFormatter = DateTimeFormatter.ISO_INSTANT
  }
}

// Typed options record for readRuns. `sourceType` is accepted for parity with the JS contract
// but is unused here (this module only reads Health Connect).
class ReadRunsOptions : Record {
  @Field
  var limit: Int? = null

  @Field
  var sourceType: String? = null
}

// Wraps Health Connect's ActivityResultContract<Set<String>, Set<String>> in Expo's
// AppContextActivityResultContract so the permission sheet can be launched from a module.
// Input is a HashSet<String> (Serializable) of the permission strings to request; output is
// the Set<String> of permissions the user granted.
class HealthConnectPermissionContract :
  AppContextActivityResultContract<HashSet<String>, Set<String>> {
  private val delegate = PermissionController.createRequestPermissionResultContract()

  override fun createIntent(context: Context, input: HashSet<String>): Intent {
    return delegate.createIntent(context, input)
  }

  override fun parseResult(input: HashSet<String>, resultCode: Int, intent: Intent?): Set<String> {
    return delegate.parseResult(resultCode, intent)
  }
}
