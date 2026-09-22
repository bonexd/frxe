export async function requestAppExit({ invoke, currentWindow }) {
  if (typeof invoke === 'function') {
    try {
      await invoke('exit_app');
      return 'native-exit';
    } catch {
      // Fall through to a direct window teardown only if native exit is unavailable.
    }
  }
  if (currentWindow?.destroy) {
    await currentWindow.destroy();
    return 'destroy';
  }
  if (currentWindow?.close) {
    await currentWindow.close();
    return 'close';
  }
  return 'noop';
}

export async function requestWindowDrag(currentWindow, invoke = null) {
  if (typeof currentWindow?.startDragging === 'function') {
    try {
      await currentWindow.startDragging();
      return 'drag';
    } catch {
      // Fall through to the native Rust command.
    }
  }
  if (typeof invoke === 'function') {
    try {
      await invoke('start_drag_window');
      return 'native-drag';
    } catch {
      // No supported drag path remains.
    }
  }
  return 'noop';
}

export async function requestWindowAction(action, currentWindow, invoke = null) {
  const nativeCommand = action === 'minimize'
    ? 'minimize_window'
    : action === 'maximize'
      ? 'toggle_maximize_window'
      : '';

  if (nativeCommand && typeof invoke === 'function') {
    try {
      await invoke(nativeCommand);
      return `native-${action}`;
    } catch {
      // Fall back to the JS window API if the native command is unavailable.
    }
  }

  if (!currentWindow) return 'noop';
  if (action === 'minimize' && typeof currentWindow.minimize === 'function') {
    await currentWindow.minimize();
    return 'minimize';
  }
  if (action === 'maximize' && typeof currentWindow.toggleMaximize === 'function') {
    await currentWindow.toggleMaximize();
    return 'maximize';
  }
  return 'noop';
}

function resolveTauri(explicitTauri = null) {
  return explicitTauri || globalThis.window?.__TAURI__ || null;
}

export function installWindowControls(explicitTauri = null) {
  if (typeof document === 'undefined') return;
  document.addEventListener('mousedown', async (event) => {
    if (event.button !== 0) return;
    if (event.target?.closest?.('button, input, select, textarea, a')) return;
    const region = event.target?.closest?.('[data-vitr-drag-region]');
    if (!region) return;

    // Native Tauri drag regions are the primary path. Avoid starting a second drag
    // through JS/Rust on the same mouse gesture.
    if (event.target?.closest?.('[data-tauri-drag-region]')) return;

    const tauri = resolveTauri(explicitTauri);
    const currentWindow = tauri?.window?.getCurrentWindow?.();
    const invoke = tauri?.core?.invoke ? (...args) => tauri.core.invoke(...args) : null;
    await requestWindowDrag(currentWindow, invoke);
  }, true);

  document.addEventListener('dblclick', async (event) => {
    if (event.target?.closest?.('button, input, select, textarea, a')) return;
    if (!event.target?.closest?.('[data-vitr-drag-region]')) return;
    const tauri = resolveTauri(explicitTauri);
    const currentWindow = tauri?.window?.getCurrentWindow?.();
    const invoke = tauri?.core?.invoke ? (...args) => tauri.core.invoke(...args) : null;
    await requestWindowAction('maximize', currentWindow, invoke);
  }, true);

  document.addEventListener('click', async (event) => {
    const button = event.target?.closest?.('[data-window]');
    if (!button) return;
    const action = button.dataset?.window || button.getAttribute?.('data-window');
    if (!['minimize', 'maximize', 'close'].includes(action)) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();

    const tauri = resolveTauri(explicitTauri);
    const currentWindow = tauri?.window?.getCurrentWindow?.();
    const invoke = tauri?.core?.invoke ? (...args) => tauri.core.invoke(...args) : null;
    if (action === 'close') {
      await requestAppExit({ invoke, currentWindow });
      return;
    }
    await requestWindowAction(action, currentWindow, invoke);
  }, true);
}

installWindowControls();
