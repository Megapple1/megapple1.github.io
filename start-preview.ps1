param([switch]$Check)

$ErrorActionPreference = 'Stop'
$projectDirectory = $PSScriptRoot
$pythonExecutable = $null
$runtimePattern = Join-Path $env:ProgramFiles 'WindowsApps\OpenAI.CodexPrimaryRuntime.v*\dependencies\python\python.exe'
$runtimeCandidates = @(Get-Item -Path $runtimePattern -ErrorAction SilentlyContinue)
if ($runtimeCandidates.Count -gt 0) {
    $pythonExecutable = $runtimeCandidates[-1].FullName
} else {
    $pythonCommand = Get-Command python -ErrorAction SilentlyContinue
    if ($pythonCommand) { $pythonExecutable = $pythonCommand.Source }
}
if (-not $pythonExecutable) {
    throw 'Python was not found. Open this project in Codex or install Python to use the local preview.'
}

$previewPort = 8000
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $previewPort)
try {
    $listener.Start()
} catch {
    throw 'Port 8000 is already in use. Close the previous preview window and try again.'
} finally {
    $listener.Stop()
}

$serverProcess = Start-Process -FilePath $pythonExecutable -ArgumentList @('-m', 'http.server', "$previewPort", '--bind', '127.0.0.1') -WorkingDirectory $projectDirectory -WindowStyle Hidden -PassThru
try {
    $previewUrl = "http://127.0.0.1:$previewPort"
    $ready = $false
    foreach ($attempt in 1..30) {
        if ($serverProcess.HasExited) { throw 'The local preview could not start.' }
        try {
            $response = Invoke-WebRequest -Uri $previewUrl -UseBasicParsing -TimeoutSec 1
            if ($response.StatusCode -eq 200) { $ready = $true; break }
        } catch {
            Start-Sleep -Milliseconds 150
        }
    }
    if (-not $ready) { throw 'The local preview did not respond.' }
    Write-Host "Sketchroom is ready: $previewUrl"
    if (-not $Check) {
        Write-Host 'Keep this window open while drawing.'
        Start-Process $previewUrl
        Read-Host 'Press Enter here to stop the preview'
    }
} finally {
    if (-not $serverProcess.HasExited) { Stop-Process -Id $serverProcess.Id }
}
