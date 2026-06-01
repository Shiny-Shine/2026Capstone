param(
  [int]$Port = 4173,
  [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
$mimeTypes = @{
  ".css" = "text/css; charset=utf-8"
  ".html" = "text/html; charset=utf-8"
  ".js" = "text/javascript; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".png" = "image/png"
  ".svg" = "image/svg+xml"
}

function Write-HttpResponse {
  param(
    [System.Net.Sockets.TcpClient]$Client,
    [string]$Status,
    [string]$ContentType,
    [byte[]]$Body,
    [bool]$IncludeBody = $true
  )

  $stream = $Client.GetStream()
  $header = "HTTP/1.1 $Status`r`nContent-Type: $ContentType`r`nContent-Length: $($Body.Length)`r`nConnection: close`r`n`r`n"
  $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
  $stream.Write($headerBytes, 0, $headerBytes.Length)
  if ($IncludeBody) {
    $stream.Write($Body, 0, $Body.Length)
  }
  $stream.Flush()
}

try {
  $listener.Start()
  $userPageUrl = "http://127.0.0.1:$Port/index.html"
  $adminPageUrl = "http://127.0.0.1:$Port/admin.html"

  Write-Host ""
  Write-Host "EV Battery Intelligence Dashboard is running." -ForegroundColor Green
  Write-Host "User page : $userPageUrl"
  Write-Host "Admin page: $adminPageUrl"
  Write-Host "Press Ctrl+C to stop the local server."
  Write-Host ""

  if (-not $NoBrowser) {
    Start-Process $userPageUrl
  }

  while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
      $stream = $client.GetStream()
      $reader = [System.IO.StreamReader]::new(
        $stream,
        [System.Text.Encoding]::ASCII,
        $false,
        1024,
        $true
      )
      $requestLine = $reader.ReadLine()
      while (($line = $reader.ReadLine()) -ne "") {
        if ($null -eq $line) {
          break
        }
      }

      if ([string]::IsNullOrWhiteSpace($requestLine)) {
        continue
      }

      $requestParts = $requestLine -split " "
      $method = $requestParts[0]
      $relativePath = [System.Uri]::UnescapeDataString(($requestParts[1] -split "\?")[0]).TrimStart("/")
      if ([string]::IsNullOrWhiteSpace($relativePath)) {
        $relativePath = "index.html"
      }

      $fullPath = [System.IO.Path]::GetFullPath(
        (Join-Path $projectRoot ($relativePath.Replace("/", [System.IO.Path]::DirectorySeparatorChar)))
      )
      $rootPath = [System.IO.Path]::GetFullPath($projectRoot)

      if (
        -not $fullPath.StartsWith($rootPath, [System.StringComparison]::OrdinalIgnoreCase) -or
        -not (Test-Path -LiteralPath $fullPath -PathType Leaf)
      ) {
        Write-HttpResponse -Client $client -Status "404 Not Found" -ContentType "text/plain; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes("Not found")) -IncludeBody ($method -ne "HEAD")
        continue
      }

      $extension = [System.IO.Path]::GetExtension($fullPath).ToLowerInvariant()
      $contentType = if ($mimeTypes.ContainsKey($extension)) {
        $mimeTypes[$extension]
      } else {
        "application/octet-stream"
      }
      $body = [System.IO.File]::ReadAllBytes($fullPath)
      Write-HttpResponse -Client $client -Status "200 OK" -ContentType $contentType -Body $body -IncludeBody ($method -ne "HEAD")
    } catch {
      Write-Warning $_.Exception.Message
    } finally {
      $client.Close()
    }
  }
} finally {
  $listener.Stop()
}
