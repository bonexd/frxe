import test from 'node:test';
import assert from 'node:assert/strict';
import { inferSourceContract } from '../../shared/source-contract.js';

test('Vitr contract follows the Android liquid-glass player source tree', () => {
  const contract = inferSourceContract({
    repo: 'bloodvitr/vitr',
    pkg: {
      version: '0.1.0',
      name: 'vitr',
      description: 'Vitr liquid-glass music player',
      scripts: { android: 'gradle' },
    },
    sourcePaths: [
      'app/src/main/java/com/vitr/music/ui/components/Glass.kt',
      'app/src/main/java/com/vitr/music/ui/screens/HomeScreen.kt',
      'app/src/main/java/com/vitr/music/ui/screens/SearchScreen.kt',
      'app/src/main/java/com/vitr/music/ui/screens/SaveScreen.kt',
      'app/src/main/java/com/vitr/music/ui/screens/LibraryScreen.kt',
      'app/src/main/java/com/vitr/music/ui/screens/NowPlayingScreen.kt',
      'app/src/main/java/com/vitr/music/lyrics/LyricsRepository.kt',
      'app/src/main/java/com/vitr/music/social/ListenTogether.kt',
      'app/src/main/java/com/vitr/music/voice/VoskVoiceController.kt',
      'app/src/main/java/com/vitr/music/cast/VitrCastOptionsProvider.kt',
      'app/src/main/res/xml/automotive_app_desc.xml',
    ],
    appSource: 'queue shuffle repeat',
  });

  assert.deepEqual(contract.platforms, ['Android']);
  for (const capability of ['Liquid Glass', 'Home', 'Search', 'Save', 'Library', 'Now Playing', 'Lyrics', 'Listen Together', 'Voice', 'Cast', 'Android Auto', 'Queue', 'Shuffle', 'Repeat']) {
    assert.equal(contract.capabilities.includes(capability), true, capability);
  }
});
