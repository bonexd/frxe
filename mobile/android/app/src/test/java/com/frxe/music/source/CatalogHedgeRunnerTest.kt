package com.frxe.music.source

import kotlin.system.measureTimeMillis
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class CatalogHedgeRunnerTest {
    @Test
    fun fastFallbackCanWinWithoutWaitingForSlowPrimary() = runBlocking {
        var result: List<String> = emptyList()

        val elapsed = measureTimeMillis {
            result = hedgedFirstNonEmpty(
                listOf(
                    CatalogHedgeTask(
                        startDelayMs = 0L,
                        timeoutMs = 2_000L
                    ) {
                        delay(700L)
                        emptyList()
                    },
                    CatalogHedgeTask(
                        startDelayMs = 50L,
                        timeoutMs = 2_000L
                    ) {
                        listOf("fallback")
                    }
                )
            )
        }

        assertEquals(listOf("fallback"), result)
        assertTrue("fallback took $elapsed ms", elapsed < 400L)
    }
}
