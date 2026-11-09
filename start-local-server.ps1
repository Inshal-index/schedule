$ErrorActionPreference = "Stop"

$root = [System.IO.Path]::GetFullPath((Split-Path -Parent $MyInvocation.MyCommand.Path))
$rootPrefix = $root.TrimEnd('\') + '\'
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://127.0.0.1:8765/")

try {
    $listener.Start()
} catch {
    Write-Error "Could not start the local server on port 8765: $($_.Exception.Message)"
    exit 1
}

Write-Host "Serving $root"
Write-Host "Open http://127.0.0.1:8765/admin.html (press Ctrl+C to stop)."
Start-Process "http://127.0.0.1:8765/admin.html"

while ($listener.IsListening) {
    $context = $listener.GetContext()
    $response = $context.Response

    try {
        if ($context.Request.HttpMethod -notin @("GET", "HEAD")) {
            $response.StatusCode = 405
            continue
        }

        $relativePath = [System.Uri]::UnescapeDataString($context.Request.Url.AbsolutePath.TrimStart('/'))
        if ([string]::IsNullOrWhiteSpace($relativePath)) {
            $relativePath = "index.html"
        }
        $relativePath = $relativePath.Replace('/', '\')
        $filePath = [System.IO.Path]::GetFullPath((Join-Path $root $relativePath))

        if (-not $filePath.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
            $response.StatusCode = 403
            continue
        }
        if (-not (Test-Path -LiteralPath $filePath -PathType Leaf)) {
            $response.StatusCode = 404
            continue
        }

        $extension = [System.IO.Path]::GetExtension($filePath).ToLowerInvariant()
        $response.ContentType = switch ($extension) {
            ".html" { "text/html; charset=utf-8" }
            ".js"   { "text/javascript; charset=utf-8" }
            ".css"  { "text/css; charset=utf-8" }
            ".json" { "application/json; charset=utf-8" }
            ".webmanifest" { "application/manifest+json; charset=utf-8" }
            default { "application/octet-stream" }
        }
        $response.Headers["Cache-Control"] = "no-store"
        $bytes = [System.IO.File]::ReadAllBytes($filePath)
        $response.ContentLength64 = $bytes.Length
        if ($context.Request.HttpMethod -eq "GET") {
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        }
    } catch {
        Write-Error "Could not serve request $($context.Request.Url.AbsolutePath): $($_.Exception.Message)"
        $response.StatusCode = 500
    } finally {
        $response.Close()
    }
}
