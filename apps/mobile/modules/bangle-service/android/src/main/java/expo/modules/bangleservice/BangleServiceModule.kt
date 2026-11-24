package expo.modules.bangleservice

import android.content.Intent
import androidx.core.content.ContextCompat
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class BangleServiceModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("BangleService")

    // Throws to JS when Android refuses (e.g. ForegroundServiceStartNotAllowedException from the
    // background); the caller logs it and keeps the foreground link.
    Function("start") {
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      ContextCompat.startForegroundService(context, Intent(context, BangleLinkService::class.java))
    }
  }
}
