plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.compose")
    id("com.google.devtools.ksp")
}

val vitrVersion = rootProject.file("../../VERSION").readText().trim()
val vitrVersionParts = vitrVersion.substringBefore('-').split('.').map { it.toIntOrNull() ?: 0 }
val vitrVersionCode =
    (vitrVersionParts.getOrElse(0) { 0 } * 10000) +
    (vitrVersionParts.getOrElse(1) { 0 } * 100) +
    vitrVersionParts.getOrElse(2) { 0 }

val bloodKeystore = providers.environmentVariable("BLOOD_KEYSTORE").orNull
val bloodStorePassword = providers.environmentVariable("BLOOD_STORE_PASSWORD").orNull
val bloodKeyAlias = providers.environmentVariable("BLOOD_KEY_ALIAS").orNull ?: "blood"
val bloodKeyPassword = providers.environmentVariable("BLOOD_KEY_PASSWORD").orNull
val hasBloodSigning = listOf(bloodKeystore, bloodStorePassword, bloodKeyPassword).all { !it.isNullOrBlank() }
val ciReleaseDebugSigning =
    providers.environmentVariable("VITR_CI_RELEASE_DEBUG_SIGNING").orNull == "1"

fun buildConfigString(value: String): String =
    "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\""

android {
    namespace = "com.frxe.music"
    compileSdk = 37

    defaultConfig {
        applicationId = "com.bloodvitr.vitr"
        minSdk = 26
        targetSdk = 37
        versionCode = vitrVersionCode
        versionName = vitrVersion
        buildConfigField("String", "OWNER", "\"Blood\"")
        buildConfigField("String", "PUBLISHER", "\"Blood\"")
        buildConfigField("String", "AUTHOR", "\"Blood\"")
        vectorDrawables.useSupportLibrary = true
    }

    signingConfigs {
        if (hasBloodSigning) {
            create("bloodRelease") {
                storeFile = file(bloodKeystore!!)
                storePassword = bloodStorePassword
                keyAlias = bloodKeyAlias
                keyPassword = bloodKeyPassword
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = when {
                hasBloodSigning -> signingConfigs.getByName("bloodRelease")
                ciReleaseDebugSigning -> signingConfigs.getByName("debug")
                else -> signingConfigs.getByName("debug")
            }
        }
    }

    compileOptions {
        isCoreLibraryDesugaringEnabled = true
        sourceCompatibility = JavaVersion.VERSION_21
        targetCompatibility = JavaVersion.VERSION_21
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    lint {
        checkReleaseBuilds = false
    }

    packaging {
        jniLibs.useLegacyPackaging = true
        resources.excludes += setOf(
            "/META-INF/{AL2.0,LGPL2.1}",
            "META-INF/DEPENDENCIES"
        )
    }

    sourceSets {
        getByName("main") {
            manifest.srcFile("src/standalone/AndroidManifest.xml")
        }
    }
}

dependencies {
    implementation("androidx.activity:activity-compose:1.13.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.11.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.11.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-ktx:2.11.0")

    implementation("androidx.compose.runtime:runtime:1.12.1")
    implementation("androidx.compose.foundation:foundation:1.12.1")
    implementation("androidx.compose.animation:animation:1.12.1")
    implementation("androidx.compose.ui:ui:1.12.1")
    implementation("androidx.compose.ui:ui-tooling-preview:1.12.1")
    debugImplementation("androidx.compose.ui:ui-tooling:1.12.1")
    implementation("androidx.compose.material3:material3:1.4.0")
    implementation("androidx.compose.material:material-icons-extended:1.7.8")
    implementation("io.github.kyant0:backdrop:2.0.1")

    implementation("androidx.media3:media3-exoplayer:1.11.0")
    implementation("androidx.media3:media3-session:1.11.0")
    implementation("androidx.media3:media3-datasource:1.11.0")
    implementation("androidx.media3:media3-database:1.11.0")
    implementation("androidx.media3:media3-exoplayer-dash:1.11.0")
    implementation("androidx.media3:media3-exoplayer-hls:1.11.0")
    implementation("androidx.media3:media3-ui:1.11.0")
    implementation("androidx.media3:media3-cast:1.11.0")

    implementation("com.google.android.gms:play-services-cast-framework:22.3.1")
    implementation("androidx.mediarouter:mediarouter:1.8.1")

    implementation("androidx.room:room-runtime:2.8.5")
    implementation("androidx.room:room-ktx:2.8.5")
    ksp("androidx.room:room-compiler:2.8.5")

    implementation("androidx.datastore:datastore-preferences:1.2.1")
    implementation("com.alphacephei:vosk-android:0.3.75")
    implementation("dev.ffmpegkit-maintained:ffmpeg-kit-full:8.1.7")

    implementation("com.github.TeamNewPipe:NewPipeExtractor:v0.26.4")
    implementation("com.squareup.okhttp3:okhttp:5.5.0")
    implementation("com.fasterxml.jackson.core:jackson-databind:2.22.2")
    implementation("io.github.junkfood02.youtubedl-android:library:0.18.1")
    implementation("io.github.junkfood02.youtubedl-android:ffmpeg:0.18.1")
    implementation("io.github.junkfood02.youtubedl-android:aria2c:0.18.1")

    testImplementation("junit:junit:4.13.2")
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs_nio:2.1.5")
}
