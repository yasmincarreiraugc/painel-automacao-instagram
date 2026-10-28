# =====================================================================
# servidor-local.ps1: servidor estático simples pra testar no Windows
# (não precisa de Python nem Node).
# Uso:  powershell -ExecutionPolicy Bypass -File servidor-local.ps1
# Depois abra http://localhost:5173
# Pra parar: feche a janela ou aperte Ctrl+C.
# =====================================================================
param([int]$Porta = 5173)

$raiz = Join-Path $PSScriptRoot "frontend"
$tipos = @{
  ".html" = "text/html; charset=utf-8"; ".css" = "text/css; charset=utf-8"
  ".js" = "application/javascript; charset=utf-8"; ".json" = "application/json"
  ".svg" = "image/svg+xml"; ".png" = "image/png"; ".jpg" = "image/jpeg"; ".ico" = "image/x-icon"
}

$http = New-Object System.Net.HttpListener
$http.Prefixes.Add("http://localhost:$Porta/")
$http.Start()
Write-Host "Servidor no ar: http://localhost:$Porta (Ctrl+C pra parar)"

while ($http.IsListening) {
  $ctx = $http.GetContext()
  $caminho = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart("/"))
  if ($caminho -eq "") { $caminho = "index.html" }
  $arquivo = [IO.Path]::GetFullPath((Join-Path $raiz $caminho))

  if ($arquivo.StartsWith($raiz) -and (Test-Path $arquivo -PathType Leaf)) {
    $bytes = [IO.File]::ReadAllBytes($arquivo)
    $ext = [IO.Path]::GetExtension($arquivo).ToLower()
    $ctx.Response.ContentType = if ($tipos[$ext]) { $tipos[$ext] } else { "application/octet-stream" }
    $ctx.Response.Headers.Add("Cache-Control", "no-store")
    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  } else {
    $ctx.Response.StatusCode = 404
  }
  $ctx.Response.Close()
}
