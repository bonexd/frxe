package com.frxe.music.save

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper

object DownloadQueueItemCodec {
    private val mapper = ObjectMapper()

    fun encode(items: List<DownloadQueueItem>): String {
        val array = mapper.createArrayNode()

        items.forEach { item ->
            val node = mapper.createObjectNode()
                .put("id", item.id)
                .put("sourceUrl", item.sourceUrl)
                .put("title", item.title)
                .put("artist", item.artist)
                .put("format", item.format)
                .put("quality", item.quality)
                .put("executionKind", item.executionKind.name)
                .put("state", item.state.name)
                .put("progress", item.progress.toDouble())
                .put("message", item.message)
                .put("retryCount", item.retryCount)
                .put("createdAtMs", item.createdAtMs)
                .put("updatedAtMs", item.updatedAtMs)

            item.engineRequestJson?.let { node.put("engineRequestJson", it) }
            item.backend?.let { node.put("backend", it) }
            item.savedUri?.let { node.put("savedUri", it) }
            item.savedTitle?.let { node.put("savedTitle", it) }

            array.add(node)
        }

        return mapper.writeValueAsString(array)
    }

    fun decode(raw: String?): List<DownloadQueueItem> =
        runCatching {
            if (raw.isNullOrBlank()) return@runCatching emptyList()

            val root = mapper.readTree(raw)
            if (!root.isArray) return@runCatching emptyList()

            root.mapNotNull(::decodeItem)
        }.getOrDefault(emptyList())

    private fun decodeItem(node: JsonNode): DownloadQueueItem? {
        val id = node.text("id")?.trim().orEmpty()
        val sourceUrl = node.text("sourceUrl")?.trim().orEmpty()
        if (id.isBlank() || sourceUrl.isBlank()) return null

        return DownloadQueueItem(
            id = id,
            sourceUrl = sourceUrl,
            title = node.text("title").orEmpty(),
            artist = node.text("artist").orEmpty(),
            format = node.text("format") ?: SaveFormat.MP3.name,
            quality = node.text("quality") ?: SaveQuality.Mp3K320.name,
            executionKind = node.enumValue(
                "executionKind",
                DownloadExecutionKind.Legacy
            ),
            engineRequestJson = node.text("engineRequestJson"),
            state = node.enumValue(
                "state",
                DownloadQueueItemState.Failed
            ),
            progress = node["progress"]
                ?.takeIf(JsonNode::isNumber)
                ?.asDouble(0.0)
                ?.toFloat()
                ?.coerceIn(0f, 1f)
                ?: 0f,
            message = node.text("message") ?: "Queued",
            backend = node.text("backend"),
            retryCount = node["retryCount"]
                ?.takeIf(JsonNode::isIntegralNumber)
                ?.asInt(0)
                ?.coerceAtLeast(0)
                ?: 0,
            savedUri = node.text("savedUri"),
            savedTitle = node.text("savedTitle"),
            createdAtMs = node["createdAtMs"]
                ?.takeIf(JsonNode::isIntegralNumber)
                ?.asLong(0L)
                ?: 0L,
            updatedAtMs = node["updatedAtMs"]
                ?.takeIf(JsonNode::isIntegralNumber)
                ?.asLong(0L)
                ?: 0L
        )
    }

    private fun JsonNode.text(name: String): String? =
        get(name)
            ?.takeUnless { it.isNull || it.isMissingNode }
            ?.asText()
            ?.takeIf(String::isNotBlank)

    private inline fun <reified T : Enum<T>> JsonNode.enumValue(
        name: String,
        default: T
    ): T =
        text(name)
            ?.let { raw ->
                enumValues<T>().firstOrNull { it.name == raw }
            }
            ?: default
}
