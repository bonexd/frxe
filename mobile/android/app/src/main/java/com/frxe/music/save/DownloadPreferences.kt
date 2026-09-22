package com.frxe.music.save

import android.content.Context

object DownloadPreferences {
    private const val PREFS = "vitr_audio_downloads"
    private const val KEY_DEFAULT_FORMAT = "default_format"

    const val DISPLAY_LOCATION = "Music/Vitr"

    fun defaultFormat(context: Context): SaveFormat {
        val raw = context
            .applicationContext
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY_DEFAULT_FORMAT, SaveFormat.MP3.name)

        return runCatching {
            SaveFormat.valueOf(raw ?: SaveFormat.MP3.name)
        }.getOrDefault(SaveFormat.MP3)
    }

    fun setDefaultFormat(
        context: Context,
        format: SaveFormat
    ) {
        context
            .applicationContext
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_DEFAULT_FORMAT, format.name)
            .apply()
    }
}
