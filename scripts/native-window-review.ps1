param(
    [string]$OutputDir = (Join-Path $PSScriptRoot "..\\output\\native-review")
)

$ErrorActionPreference = "Stop"

$appDir = Split-Path -Parent $PSScriptRoot
$repoRoot = Split-Path -Parent (Split-Path -Parent $appDir)
$exePath = Join-Path $appDir "release\\build\\win-unpacked\\BAPBAP Launcher V2.exe"
$realUserDataDir = Join-Path $env:APPDATA "bapbap-launcher-v2"
$realSettingsPath = Join-Path $realUserDataDir "bapbap-launcher-v2.json"
$tempUserDataDir = Join-Path ([System.IO.Path]::GetTempPath()) "bapbap-launcher-v2-native-review"
$tempSettingsPath = Join-Path $tempUserDataDir "bapbap-launcher-v2.json"

Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class NativeUiReview {
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);

    [DllImport("user32.dll")]
    public static extern bool SetCursorPos(int x, int y);

    [DllImport("user32.dll")]
    public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
}
"@

Add-Type -AssemblyName System.Drawing

$MOUSEEVENTF_LEFTDOWN = 0x0002
$MOUSEEVENTF_LEFTUP = 0x0004
$SW_RESTORE = 9

function Stop-LauncherProcess {
    Get-Process -Name "BAPBAP Launcher V2" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
}

function Get-MainWindowHandle {
    param(
        [System.Diagnostics.Process]$Process
    )

    $deadline = (Get-Date).AddSeconds(30)
    while ((Get-Date) -lt $deadline) {
        $windowProcess = Get-Process -Name $Process.ProcessName -ErrorAction SilentlyContinue |
            Where-Object { $_.MainWindowHandle -and $_.MainWindowHandle -ne 0 } |
            Sort-Object StartTime |
            Select-Object -Last 1

        if ($windowProcess -and $windowProcess.MainWindowHandle -ne 0) {
            return [IntPtr]$windowProcess.MainWindowHandle
        }
        Start-Sleep -Milliseconds 250
    }

    throw "Timed out waiting for launcher window."
}

function Focus-Window {
    param(
        [IntPtr]$Handle
    )

    [NativeUiReview]::ShowWindow($Handle, $SW_RESTORE) | Out-Null
    [NativeUiReview]::SetForegroundWindow($Handle) | Out-Null
    Start-Sleep -Milliseconds 350
}

function Get-WindowRect {
    param(
        [IntPtr]$Handle
    )

    $rect = New-Object NativeUiReview+RECT
    [NativeUiReview]::GetWindowRect($Handle, [ref]$rect) | Out-Null
    return $rect
}

function Click-RelativePoint {
    param(
        [IntPtr]$Handle,
        [int]$X,
        [int]$Y
    )

    $rect = Get-WindowRect -Handle $Handle
    $targetX = $rect.Left + $X
    $targetY = $rect.Top + $Y
    [NativeUiReview]::SetCursorPos($targetX, $targetY) | Out-Null
    Start-Sleep -Milliseconds 80
    [NativeUiReview]::mouse_event($MOUSEEVENTF_LEFTDOWN, 0, 0, 0, [UIntPtr]::Zero)
    Start-Sleep -Milliseconds 40
    [NativeUiReview]::mouse_event($MOUSEEVENTF_LEFTUP, 0, 0, 0, [UIntPtr]::Zero)
    Start-Sleep -Milliseconds 650
}

function Save-WindowScreenshot {
    param(
        [IntPtr]$Handle,
        [string]$Path
    )

    Focus-Window -Handle $Handle
    $rect = Get-WindowRect -Handle $Handle
    $width = [Math]::Max(1, $rect.Right - $rect.Left)
    $height = [Math]::Max(1, $rect.Bottom - $rect.Top)
    $bitmap = New-Object System.Drawing.Bitmap($width, $height)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)

    try {
        $source = New-Object System.Drawing.Point($rect.Left, $rect.Top)
        $target = [System.Drawing.Point]::Empty
        $size = New-Object System.Drawing.Size($width, $height)
        $graphics.CopyFromScreen($source, $target, $size)
        $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    }
    finally {
        $graphics.Dispose()
        $bitmap.Dispose()
    }
}

function New-ReviewSettingsFile {
    New-Item -ItemType Directory -Force -Path $tempUserDataDir | Out-Null

    $settings = @{}
    if (Test-Path $realSettingsPath) {
        try {
            $settings = Get-Content $realSettingsPath -Raw | ConvertFrom-Json -AsHashtable
        } catch {
            $settings = @{}
        }
    }

    if (-not $settings.ContainsKey("manifestUrl")) {
        $settings["manifestUrl"] = "https://raw.githubusercontent.com/Sonic0810/BAPBAPLauncher/main/manifest/index.json"
    }

    if (-not $settings.ContainsKey("instancesRoot")) {
        $settings["instancesRoot"] = Join-Path $realUserDataDir "instances"
    }

    $settings["leftRailCollapsed"] = $false
    $settings["leftRailAutoHover"] = $false
    $settings["launcherAutoUpdate"] = $false
    $settings["uiOnboardingCompleted"] = $true
    $settings["uiMotionEnabled"] = $true
    $settings["debugShowEffectLab"] = $false

    $settings | ConvertTo-Json -Depth 8 | Set-Content -Path $tempSettingsPath -Encoding UTF8
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

Stop-LauncherProcess
New-ReviewSettingsFile

$previousUserDataDir = $env:V2_USER_DATA_DIR
$previousDisableDevtools = $env:V2_DISABLE_DEVTOOLS
$env:V2_USER_DATA_DIR = $tempUserDataDir
$env:V2_DISABLE_DEVTOOLS = "1"

$process = Start-Process -FilePath $exePath -WorkingDirectory (Split-Path -Parent $exePath) -PassThru

try {
    $handle = Get-MainWindowHandle -Process $process
    Focus-Window -Handle $handle
    Start-Sleep -Seconds 2

    Save-WindowScreenshot -Handle $handle -Path (Join-Path $OutputDir "electron-instances-native.png")

    Click-RelativePoint -Handle $handle -X 130 -Y 256
    Save-WindowScreenshot -Handle $handle -Path (Join-Path $OutputDir "electron-launch-native.png")

    Click-RelativePoint -Handle $handle -X 130 -Y 303
    Start-Sleep -Seconds 1
    Save-WindowScreenshot -Handle $handle -Path (Join-Path $OutputDir "electron-mods-native.png")

    Click-RelativePoint -Handle $handle -X 560 -Y 410
    Click-RelativePoint -Handle $handle -X 560 -Y 410
    Start-Sleep -Seconds 1
    Save-WindowScreenshot -Handle $handle -Path (Join-Path $OutputDir "electron-mods-detail-native.png")

    Click-RelativePoint -Handle $handle -X 1010 -Y 165
    Start-Sleep -Milliseconds 500
    Click-RelativePoint -Handle $handle -X 130 -Y 352
    Start-Sleep -Seconds 1
    Save-WindowScreenshot -Handle $handle -Path (Join-Path $OutputDir "electron-settings-native.png")
}
finally {
    if (-not $process.HasExited) {
        $process.CloseMainWindow() | Out-Null
        Start-Sleep -Seconds 1
    }

    if (-not $process.HasExited) {
        Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    }

    if ($null -eq $previousUserDataDir) {
        Remove-Item Env:V2_USER_DATA_DIR -ErrorAction SilentlyContinue
    } else {
        $env:V2_USER_DATA_DIR = $previousUserDataDir
    }

    if ($null -eq $previousDisableDevtools) {
        Remove-Item Env:V2_DISABLE_DEVTOOLS -ErrorAction SilentlyContinue
    } else {
        $env:V2_DISABLE_DEVTOOLS = $previousDisableDevtools
    }

    Remove-Item -Recurse -Force $tempUserDataDir -ErrorAction SilentlyContinue
}
