package com.frxe.music.save

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FrxeSaveEnginePolicyTest {

    @Test
    fun `caller owned local input is never a cleanup target`() {
        val input = File("caller-owned.media")
        val output = File("generated-output.mp3")

        val cleanup = FrxeSaveEnginePolicy.cleanupFiles(
            input = input,
            output = output,
            ownership = SaveInputOwnership.Caller
        )

        assertFalse(cleanup.contains(input))
        assertEquals(listOf(output), cleanup)
    }

    @Test
    fun `engine owned downloaded input and generated output are cleanup targets`() {
        val input = File("engine-owned.media")
        val output = File("generated-output.mp3")

        val cleanup = FrxeSaveEnginePolicy.cleanupFiles(
            input = input,
            output = output,
            ownership = SaveInputOwnership.Engine
        )

        assertTrue(cleanup.contains(input))
        assertTrue(cleanup.contains(output))
        assertEquals(2, cleanup.size)
    }
}
