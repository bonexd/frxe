plugins {
    id("com.android.application")
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

android {
    namespace = "com.bloodvitr.vitr"
    compileSdk = 37
    enableKotlin = false

    defaultConfig {
        applicationId = "com.bloodvitr.vitr"
        minSdk = 26
        targetSdk = 37
        versionCode = vitrVersionCode
        versionName = vitrVersion
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
            signingConfig = if (hasBloodSigning) {
                signingConfigs.getByName("bloodRelease")
            } else {
                signingConfigs.getByName("debug")
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_21
        targetCompatibility = JavaVersion.VERSION_21
    }

    lint {
        checkReleaseBuilds = false
    }

    sourceSets {
        getByName("main") {
            manifest.srcFile("../app/src/ci/AndroidManifest.xml")
            java.setSrcDirs(listOf("../app/src/ci/java"))
            res.setSrcDirs(listOf("../app/src/standalone/res"))
            assets.setSrcDirs(listOf("../app/src/standalone/assets"))
        }
    }
}
