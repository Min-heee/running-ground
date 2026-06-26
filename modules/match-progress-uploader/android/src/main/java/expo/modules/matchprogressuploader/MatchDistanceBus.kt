package expo.modules.matchprogressuploader

import java.util.concurrent.atomic.AtomicReference

/**
 * MatchDistanceBus — a tiny process-wide bridge for the NATIVE DISTANCE ACCUMULATOR, mirroring
 * MatchUploadResponseBus. The foreground service (which owns the GPS consumer + accumulator but is
 * NOT the expo Module instance) publishes the running total here on every advance, and:
 *
 *  - the Module reads `totalMeters` SYNCHRONOUSLY for getAccumulatedDistanceMeters() (the JS merge
 *    needs a synchronous read at flush time). It is a single @Volatile Double, so a cross-thread
 *    read is safe and lock-free.
 *  - the Module registers a listener (onDistanceAccumulated emitter) so a future variant can surface
 *    live screen-off distance; if no listener is attached (JS reloaded) emit() simply drops it.
 *
 * The total is RESET to 0 when a distance session resets so a stale value from a prior run can never
 * be merged into a new one. The merge in JS takes max(jsKm, nativeKm) — so even a brief stale read
 * can only ever ADD distance, never subtract.
 */
internal object MatchDistanceBus {
  private val listenerRef = AtomicReference<((Double) -> Unit)?>(null)

  // The latest native running total in meters. Read synchronously by the Module. @Volatile so the
  // GPS-callback thread's writes are visible to the reader thread without a lock.
  @Volatile
  private var latestMeters: Double = 0.0

  val totalMeters: Double
    get() = latestMeters

  fun setListener(listener: ((Double) -> Unit)?) {
    listenerRef.set(listener)
  }

  // Publish a new total (called by the service on each advance) + notify any listener.
  fun emit(meters: Double) {
    latestMeters = meters
    listenerRef.get()?.invoke(meters)
  }

  // Reset the published total (called when the distance session resets / the run starts) so a stale
  // value can never leak into a new run's merge.
  fun reset() {
    latestMeters = 0.0
  }
}
