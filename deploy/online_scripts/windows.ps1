Clear-Host
Write-Host @"
                      ╔════════════╗
                    ╔═╝     ,---.  ║
                  ╔═╝      /__./|  ║
         ╔════════╝   ,---.;  ; |  ║
       ╔═╝  __  ,-.  /___/ \  | |  ║
     ╔═╝  ,' ,'/ /|  \   ;  \ ' |  ║
     ║    '  | |' |   \   \  \: |  ║
     ║    |  |   ,'    ;   \  ' .  ║
     ║    '  :  /       \   \   '  ║
     ║    |  | '         \   `   ;  ║
     ║    ;  : |          :   \ |  ║
     ║     ---'            '---"   ║
     ╚═════════════════════════════╝
"@  -ForegroundColor Red

# ===== 初始化变量 =====
$originalWorkingDir = Get-Location
$owner = "jasoneri"
$repo = "redViewer"
$realProjPath = Join-Path $originalWorkingDir $repo
$projPyPath = Join-Path $realProjPath "backend"
$ps1Script = Join-Path $originalWorkingDir "rV.ps1"
$batScript = Join-Path $originalWorkingDir "rV.bat"
$localVerFile = Join-Path $originalWorkingDir "ver.txt"
$releasesApiUrl = "https://api.github.com/repos/$owner/$repo/releases"
$script:updateInfo = @{
    UpdateAvailable = $false
    LatestTag = $null
}
$script:backendOnly = $args -contains "--backend-only"
# 创建脚本
if (-not (Test-Path $ps1Script)) { 
    $scriptContent = Invoke-RestMethod -Uri "https://gitee.com/json_eri/redViewer/raw/master/deploy/online_scripts/windows.ps1"
    $scriptContent | Out-File -FilePath $ps1Script -Encoding UTF8
}
if (-not (Test-Path $batScript)) { 
    $batScriptContent = "powershell -ExecutionPolicy Bypass -File `"$ps1Script`""
    $batScriptContent | Out-File -FilePath $batScript -Encoding UTF8
}

# ===== 环境检查函数 =====
function Test-Environment {
    $envMissing = $false
    # 检查uv
    try {
        $uvVersion = uv --version 2>&1
        if (-not $uvVersion -or $LASTEXITCODE -ne 0) { throw }
    }
    catch {
        Write-Output "[Test-Environment]❌ uv未安装"
        $envMissing = $true
    }
    # 检查bun (--backend-only 模式跳过)
    if (-not $script:backendOnly -and -not (Get-Command bun -ErrorAction SilentlyContinue)) {
        Write-Output "[Test-Environment]❌ bun未安装"
        $envMissing = $true
    }
    return $envMissing
}
function Speedgithub {
    param (
        [string]$originalUrl
    )
    # 使用脚本作用域变量
    if (-not $script:asked) {
        $enableSpeed = Read-Host "是否启用加速？(y/n)"
        if ($enableSpeed -eq 'y') {
            $speedUrl = Read-Host "请粘贴格式链接（进 github.akams.cn 输入任意字符获取，例如：https://aaaa.bbbb/https/114514）"
            if ($speedUrl -match '(https?://[^/]+)') {
                $script:speedPrefix = $Matches[1]
                Write-Host "✈️ 加速前缀: $script:speedPrefix"  # 使用 Write-Host 避免返回值
            }
            else {
                Write-Host "❌ 链接格式无效，不使用加速"  # 使用 Write-Host
            }
        }
        $script:asked = $true
    }
    
    # 明确返回单个值
    if ($script:speedPrefix) {
        return "$script:speedPrefix/$originalUrl"
    }
    else {
        return $originalUrl
    }
}
function Install-Environment {
    $uv_ok = $true
    $python_ok = $true
    $bun_ok = $true
    
    # 检查是否以管理员权限运行
    $isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $isAdmin) {
        # 检测是否通过管道执行 (无文件路径)
        if ([string]::IsNullOrEmpty($PSCommandPath)) {
            Start-Process powershell.exe -Verb RunAs -ArgumentList @"
-ExecutionPolicy Bypass -NoExit -Command "Set-Location '$originalWorkingDir'; & '$ps1Script' --install-env"
"@
        }
        else {
            # 常规文件执行路径
            Start-Process powershell.exe -Verb RunAs -ArgumentList "-ExecutionPolicy Bypass -NoExit -Command `"Set-Location '$originalWorkingDir'; & '$PSCommandPath' --install-env`""
        }
        exit
    }
    # 安装uv
    $uvVersion = uv --version 2>&1
    if (-not $uvVersion -or $LASTEXITCODE -ne 0) {
        Write-Output "[Install-Environment]安装 uv 中..."
        $env:UV_INSTALLER_GHE_BASE_URL = Speedgithub -originalUrl "https://github.com"
        powershell -ExecutionPolicy ByPass -Command "Invoke-RestMethod -Uri 'https://astral.sh/uv/install.ps1' | Invoke-Expression"
        
        # 刷新环境变量
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
        
        # 验证 uv 是否安装成功
        $uvCheck = uv --version 2>&1
        if (-not $uvCheck -or $LASTEXITCODE -ne 0) {
            $uv_ok = $false
        } else {
            Write-Output "[Install-Environment]uv安装python..."
            $mirrorUrl = Speedgithub -originalUrl "https://github.com/astral-sh/python-build-standalone/releases/download"
            uv python install 3.12 --mirror $mirrorUrl --no-cache
            
            if ($LASTEXITCODE -ne 0) {
                $python_ok = $false
            }
        }
    }
    
    # 安装 bun (--backend-only 模式跳过)
    if (-not $script:backendOnly -and -not (Get-Command bun -ErrorAction SilentlyContinue)) {
        Write-Output "[Install-Environment]安装 bun 中..."
        $bunVersion = "1.3.6"
        $bunMirror = "https://registry.npmmirror.com/-/binary/bun/bun-v$bunVersion"
        $bunFile = "bun-windows-x64.zip"
        $bunZip = Join-Path $originalWorkingDir $bunFile
        
        Invoke-WebRequest -Uri "$bunMirror/$bunFile" -OutFile $bunZip
        
        # 解压并安装
        $bunDir = Join-Path $env:USERPROFILE ".bun"
        $bunBinDir = Join-Path $bunDir "bin"
        if (-not (Test-Path $bunBinDir)) {
            New-Item -ItemType Directory -Path $bunBinDir -Force | Out-Null
        }
        
        Expand-Archive -Path $bunZip -DestinationPath $bunDir -Force
        $extractedDir = Get-ChildItem -Path $bunDir -Directory -Filter "bun-*" | Select-Object -First 1
        Move-Item -Path (Join-Path $extractedDir.FullName "bun.exe") -Destination $bunBinDir -Force
        Remove-Item -Path $extractedDir.FullName -Recurse -Force
        Remove-Item $bunZip
        
        # 添加到用户 PATH
        $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
        if ($userPath -notlike "*$bunBinDir*") {
            [Environment]::SetEnvironmentVariable("Path", "$bunBinDir;$userPath", "User")
        }
        [Environment]::SetEnvironmentVariable("BUN_CONFIG_REGISTRY", "https://registry.npmmirror.com/", "User")
        
        $env:Path = "$bunBinDir;$env:Path"
        $env:BUN_CONFIG_REGISTRY = "https://registry.npmmirror.com/"
        
        # 验证 bun 是否安装成功
        if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
            $bun_ok = $false
        }
    }
    
    # 刷新环境变量
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
    
    # 统一检测所有安装状态
    if (-not $uv_ok) {
        Write-Host "❌ uv 安装失败，请手动安装后重试" -ForegroundColor Red
        Write-Host "访问: https://docs.astral.sh/uv/getting-started/installation/" -ForegroundColor Yellow
        Pause
        exit 1
    }
    
    if (-not $python_ok) {
        Write-Host "❌ Python 安装失败" -ForegroundColor Red
        Pause
        exit 1
    }
    
    if (-not $script:backendOnly -and -not $bun_ok) {
        Write-Host "❌ bun 安装失败，请手动安装后重试" -ForegroundColor Red
        Write-Host "访问: https://bun.sh/docs/installation" -ForegroundColor Yellow
        Pause
        exit 1
    }

    Write-Host "✅ 环境安装完成，你应该退出现在的管理员终端，然后用以下任一方式继续操作" -ForegroundColor Green
    Write-Host "1. 直接使用 $originalWorkingDir/rV.bat"
    Write-Host "2. 在此目录开终端并继续执行 'irm xxxxx' 这条远程命令"
    Write-Host "3. 用 CGS 绑定 ps1 然后点击 'run rV'"
    Write-Host "3.1 并重启 CGS，因为需要刷新 CGS 进程中 rV 环境安装后的环境变量）" -ForegroundColor Blue
    Pause
    exit
}
# 处理环境安装参数
if ($args -contains "--install-env") {
    Install-Environment @args
    exit
}
# 检查环境
if (Test-Environment) {
    Write-Output "缺少必要环境，将优先安装..."
    Install-Environment
}

# ===== 1. 检查更新函数 =====
function Get-LatestTag {
    $response = Invoke-RestMethod -Uri $releasesApiUrl -Method Get -ErrorAction Stop
    $latestTag = $response[0].tag_name
    return $latestTag
}
function Test-Update {
    try {
        $latestTag = Get-LatestTag
        # 检查本地版本
        $updateAvailable = $false

        if (Test-Path $localVerFile) {
            $localVer = (Get-Content $localVerFile -Raw).Trim()
            # 使用Python比较版本
            $isNewer = uvx python@3.12 -c "from packaging.version import parse; print(parse(`'$latestTag`') > parse(`'$localVer`'))"
            if ($isNewer -eq "True") {
                Write-Host "`n═══════════════════════════════════" -ForegroundColor Green
                Write-Host "🎁 发现新版本: $latestTag" -ForegroundColor Green -BackgroundColor Black
                Write-Host "═══════════════════════════════════" -ForegroundColor Green
                $updateAvailable = $true
            }
        }
        else {
            $updateAvailable = $true
        }
        $script:updateInfo = @{
            UpdateAvailable = $updateAvailable
            LatestTag = $latestTag
        }
    }
    catch {
        Write-Output "[Test-Update]❌ 检查更新失败: $($_.Exception.Message)"
    }
}

# ===== 2. 更新函数 =====
function Install-Dependencies {
    Write-Output "[Install-Dependencies]正在安装后端依赖..."
    Set-Location $realProjPath
    uv sync --index-url https://repo.huaweicloud.com/repository/pypi/simple
    
    # 安装前端依赖 (--backend-only 模式跳过)
    if (-not $script:backendOnly) {
        Write-Output "[Install-Dependencies]正在安装前端依赖..."
        Set-Location frontend
        bun install
    }
}

function Invoke-Update {
    # 使用全局变量获取最新版本
    $latestTag = $script:updateInfo.LatestTag
    if (-not $latestTag) {
        Write-Host "❌ 无法获取最新版本标签" -ForegroundColor Red
        return $null
    }
    
    try {
        # 构建下载URL
        $downloadUrl = "https://github.com/$owner/$repo/archive/refs/tags/$latestTag.zip"
        $downloadUrl = Speedgithub -originalUrl $downloadUrl
        
        # 2.1 下载源码
        $zipPath = Join-Path $originalWorkingDir "$repo-$latestTag.zip"
        Write-Output "[Invoke-Update]正在下载源码..."
        Invoke-WebRequest -Uri $downloadUrl -OutFile $zipPath
        
        # 2.2 解压源码
        $tmpDir = Join-Path $originalWorkingDir "tmp"
        if (-not (Test-Path $realProjPath)) { 
            New-Item -ItemType Directory -Path $realProjPath -Force | Out-Null 
        }
        if (-not (Test-Path $tmpDir)) { 
            New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null 
        }
        Expand-Archive -Path $zipPath -DestinationPath $tmpDir -Force
        
        # 2.3 剪切覆盖到目标目录
        $tmpProjTagDir = Get-ChildItem -Path $tmpDir -Directory | Select-Object -First 1
        # 先清理目标目录
        if (Test-Path $realProjPath) {
            Write-Output "[Invoke-Update]正在清理本地redViewer"
            # 使用cmd的rd命令强制删除
            cmd.exe /c "rd /s /q `"$realProjPath`""
            # 等待一小段时间确保删除完成
            Start-Sleep -Milliseconds 500
        }
        # 直接移动整个目录
        Move-Item -Path $tmpProjTagDir.FullName -Destination $realProjPath -Force
        Write-Host "代码已更换至新版..."
        Remove-Item -LiteralPath $tmpDir -Force -Recurse -ErrorAction SilentlyContinue
        Remove-Item $zipPath

        $sourceScript = Join-Path $realProjPath "deploy\online_scripts\windows.ps1"
        Copy-Item -Path $sourceScript -Destination $ps1Script -Force

        # 获取当前项目路径
        Install-Dependencies

        Set-Location $originalWorkingDir
        Write-Host "✅ 更新至版本: $($script:updateInfo.LatestTag) 完毕" -ForegroundColor Green
        # 记录新版本到原始目录
        $latestTag | Out-File $localVerFile -Encoding utf8
        return 
    }
    catch {
        Write-Output "[Invoke-Update]❌ 更新失败: $($_.Exception.Message)"
        return $null
    }
}

# ===== 3. 运行函数 =====
function Start-RedViewer {
    
    try {
        Set-Location $realProjPath
        Write-Host "`n🔖 TIP: 退出时请直接关闭终端窗口`n" -ForegroundColor Yellow
        
#         Start-Process powershell.exe -ArgumentList @"
# -NoExit -Command "cd '$realProjPath'; echo '$realProjPath'; uv run backend/app.py"
# "@
        # 静默启动后端
        Write-Output "[Start-RedViewer]正在静默启动 rV 后端..."
        $backendJob = Start-Job -ScriptBlock {
            Set-Location $using:realProjPath
            uv run backend/app.py
        }
        # 等待后端启动
        Start-Sleep -Seconds 1
        
        # 启动前端并显示输出
        Write-Output "[Start-RedViewer]正在启动 rV 前端..."
        Set-Location (Join-Path $realProjPath "frontend")
        bun run dev
        
        # 清理后端进程
        Stop-Job $backendJob
        Remove-Job $backendJob
    }
    catch {
        Write-Output "[Start-RedViewer]❌ 启动失败: $($_.Exception.Message)"
    }
}

# ===== 主程序 =====
if (-not (Test-Path $realProjPath))  {
    # 检查代码部署
    Write-Output "缺失 rV 代码，将进行代码部署..."
    $updateAvailable = $true
    $latestTag = Get-LatestTag
    $script:updateInfo = @{
        UpdateAvailable = $updateAvailable
        LatestTag = $latestTag
    }
    Invoke-Update
} else {
    # 检查更新
    Test-Update
}

# --backend-only 模式：跳过菜单，直接启动后端
if ($script:backendOnly) {
    if (-not (Test-Path $realProjPath)) {
        Write-Host "❌ 项目目录不存在" -ForegroundColor Red
        exit 1
    }
    Set-Location $realProjPath
    Write-Host "📡 [--backend-only] 启动后端..." -ForegroundColor Cyan
    uv run backend/app.py
    exit 0
}

# 用户选择菜单
while ($true) {

    Write-Host "`n╔══════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "║              主菜单              ║" -ForegroundColor Cyan
    Write-Host "╚══════════════════════════════════╝" -ForegroundColor Cyan
    Write-Host "`n1: ♻️ 更新/部署"
    Write-Host "2: 🚀 运行"
    Write-Host "3: 📡 只启动后端"
    Write-Host "其他任意键: 🔚 退出`n"
    Write-Host "请选择操作，5秒内无输入将自动尝试运行..."
    
    $choice = $null
    $timeout = 5
    $startTime = Get-Date
    
    while ($true) {
        if ([Console]::KeyAvailable) {
            $choice = Read-Host "输入后按回车"
            break
        }
        
        $elapsed = (Get-Date) - $startTime
        if ($elapsed.TotalSeconds -ge $timeout) {
            $choice = "2"
            Write-Host "`n⏱️ 正在自动尝试运行..." -ForegroundColor Yellow
            break
        }
        
        Start-Sleep -Milliseconds 100
    }
    
    switch ($choice) {
        '1' { # 更新
            if (-not $updateInfo.UpdateAvailable) {
                Write-Host "⏹️ 本地已是最新版本" -ForegroundColor Yellow
                $force = Read-Host "是否强制重新安装? (y/n)"
                if ($force -ne 'y') {
                    continue
                } else {
                    Write-Output "[switch 1]正在清理本地redViewer"
                    Remove-Item -LiteralPath $realProjPath -Force -Recurse -ErrorAction SilentlyContinue
                }
            }
            # 执行更新
            Invoke-Update
        }
        '2' { # 运行
            if (-not (Test-Path $realProjPath)) {
                Write-Host "❌ 未找到本地安装[$realProjPath]，请先部署" -ForegroundColor Red
                continue
            } else {
                Start-RedViewer
            }
        }
        '3' { # 只启动后端
            if (-not (Test-Path $realProjPath)) {
                Write-Host "❌ 未找到本地安装[$realProjPath]，请先部署" -ForegroundColor Red
                continue
            }
            Set-Location $realProjPath
            uv run backend/app.py
        }
        default {
            exit
        }
    }
}