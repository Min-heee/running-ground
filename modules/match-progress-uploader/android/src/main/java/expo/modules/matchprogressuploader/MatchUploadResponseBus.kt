package expo.modules.matchprogressuploader

import java.util.concurrent.atomic.AtomicReference

/**
 * MatchUploadResponseBus — a tiny process-wide bridge so the foreground service (which runs the
 * periodic re-POST loop but is NOT the expo Module instance) can deliver each 2xx response body
 * back to the Module, which owns the JS event emitter (`onMatchProgressResponse`).
 *
 * The Module registers a listener on start and clears it on stop/destroy. If no listener is
 * attached (e.g. JS reloaded), emit() simply drops the body — the next tick re-POSTs fresher
 * progress, so a missed emit is never fatal.
 */
internal object MatchUploadResponseBus {
  private val listenerRef = AtomicReference<((String) -> Unit)?>(null)

  fun setListener(listener: ((String) -> Unit)?) {
    listenerRef.set(listener)
  }

  fun emit(body: String) {
    listenerRef.get()?.invoke(body)
  }
}
