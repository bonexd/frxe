package com.frxe.music

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import com.frxe.music.save.FrxeDownloadService
import com.frxe.music.ui.FrxeApp
import com.frxe.music.ui.FrxeViewModel
import com.frxe.music.ui.acceptSharedText
import com.frxe.music.ui.theme.FrxeTheme

class MainActivity : ComponentActivity() {
    private val viewModel: FrxeViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        handleShareIntent(intent)

        setContent {
            FrxeTheme {
                FrxeApp(viewModel)
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleShareIntent(intent)
    }

    override fun onResume() {
        super.onResume()
        FrxeDownloadService.kick(this)
    }

    private fun handleShareIntent(candidate: Intent?) {
        if (
            candidate?.action != Intent.ACTION_SEND ||
            candidate.type != "text/plain"
        ) {
            return
        }

        viewModel.acceptSharedText(
            candidate.getStringExtra(Intent.EXTRA_TEXT)
        )
    }
}
