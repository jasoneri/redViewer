#!/bin/zsh

clear
printf "\033[31m"
cat << "EOF"
                      ╔════════════╗
                    ╔═╝     ,---.  ║
                  ╔═╝      /__./|  ║
         ╔════════╝   ,---.;  ; |  ║
       ╔═╝  __  ,-.  /___/ \  | |  ║
     ╔═╝  ,' ,'/ /|  \   ;  \ ' |  ║
     ║    '  | |' |   \   \  \: |  ║
     ║    |  |   ,'    ;   \  ' .  ║
     ║    '  :  /       \   \   '  ║
     ║    |  | '         \   `  ;  ║
     ║    ;  : |          :   \ |  ║
     ║     ---'            '---"   ║
     ╚═════════════════════════════╝
EOF
printf "\033[0m"

# ===== 初始化变量 =====
originalWorkingDir=$(pwd)
owner="jasoneri"
repo="redViewer"
realProjPath="$originalWorkingDir/$repo"
shScript="$originalWorkingDir/rV.sh"
localVerFile="$originalWorkingDir/ver.txt"
releasesApiUrl="https://api.github.com/repos/$owner/$repo/releases"
updateInfo=("false" "")
SPEED_ASKED=""
SPEED_PREFIX=""

source $HOME/.zshrc

if [ ! -f "$shScript" ]; then
    curl -L -o "$shScript" "https://gitee.com/json_eri/redViewer/raw/master/deploy/online_scripts/linux.sh"
    chmod +x "$shScript"
fi

# ===== 环境检查函数 =====
test_environment() {
    envMissing=false
    
    if ! command -v uv &> /dev/null; then
        echo "❌ uv未安装"
        envMissing=true
    fi
    
    if ! command -v npm &> /dev/null; then
        echo "❌ Node.js未安装"
        envMissing=true
    fi
    
    $envMissing && return 0 || return 1
}
speed_gtihub() {
    ori_url=$1
    # 检查是否已经询问过用户
    if [ -z "$SPEED_ASKED" ]; then
        read -r "enableSpeed?是否启用下载加速？(y/n) "
        if [[ "$enableSpeed" =~ ^[Yy]$ ]]; then
            read -r "speedUrl?请粘贴格式链接（进 github.akams.cn 输入任意字符获取，例如：https://aaaa.bbbb/https/114514）"
            if [[ "$speedUrl" =~ (https?://[^/]+) ]]; then
                SPEED_PREFIX=${match[1]}
                printf "✈️ 加速前缀: %s\n" "$SPEED_PREFIX" >&2
            else
                printf "❌ 链接格式无效，不使用加速\n" >&2
                SPEED_PREFIX=""
            fi
        else
            SPEED_PREFIX=""
        fi
        SPEED_ASKED="true"
    fi
    # 返回处理后的URL
    if [ -n "$SPEED_PREFIX" ]; then
        echo "${SPEED_PREFIX}/$ori_url"
    else
        echo "$ori_url"
    fi
}

install_environment() {
    # 检查Homebrew
    if ! command -v brew &> /dev/null; then
        echo "❌ Homebrew未安装，正在安装..."
        /bin/zsh -c "$(curl -fsSL https://gitee.com/cunkai/HomebrewCN/raw/master/Homebrew.sh)"
        echo 'eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"' >> $HOME/.zshrc
        source $HOME/.zshrc
    fi
    
    # 安装uv
    if ! command -v uv &> /dev/null; then
        echo "❌ uv未安装，正在安装..."
        brew install uv
        source $HOME/.zshrc

        echo "uv安装python..."
        mirrorUrl=$(speed_gtihub "https://github.com/astral-sh/python-build-standalone/releases/download")
        uv python install 3.12 --mirror "$mirrorUrl" --no-cache
        echo 'export UV_MANAGED_PYTHON=1' >> $HOME/.zshrc
        source $HOME/.zshrc
    fi
    
    # 安装Node.js
    if ! command -v npm &> /dev/null; then
        echo "安装 Node.js 中..."
        brew install node
        source $HOME/.zshrc
        npm config set registry https://mirrors.huaweicloud.com/repository/npm/ 
    fi
    echo "✅ 环境安装完成"
}

# ===== 1. 检查更新函数 =====
get_latestTag() {
    tmpRespFile="$originalWorkingDir/tmp_response.json"
    response=$(curl -s $releasesApiUrl > "$tmpRespFile")
    latestTag=$(echo "import json;print(json.load(open('$tmpRespFile'))[0]['tag_name'])" | uv run -)
    rm -f "$tmpRespFile"
    echo "$latestTag"
}

test_update() {
    cd "$realProjPath"
    latestTag=$(get_latestTag)
    if [ -f "$localVerFile" ]; then
        localVer=$(sed -e 's/^\xEF\xBB\xBF//' -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' "$localVerFile")
        isNewer=$(echo "from packaging.version import parse;print(parse('$latestTag')>parse('$localVer'))" | uv run -)
        if [ "$isNewer" = "True" ]; then
            printf "\n\033[32m════════════════════════════════════\033[0m\n"
            printf "\033[32;40m🎁 发现新版本: $latestTag\033[0m\n"
            printf "\033[32m════════════════════════════════════\033[0m\n"
            updateInfo=("true" "$latestTag")
        fi
    else
        updateInfo=("true" "$latestTag")
    fi
}

# ===== 2. 更新函数 =====
invoke_update() {
    set -e
    latestTag=${updateInfo[2]}
    [ -z "$latestTag" ] && echo "❌ 无法获取最新版本标签" && return
    
    # 检查必要工具
    if ! command -v unzip &> /dev/null; then
        echo "❌ unzip未安装，正在安装..."
        brew install unzip
    fi
    
    # 下载源码
    downloadUrl=$(speed_gtihub "https://github.com/$owner/$repo/archive/refs/tags/$latestTag.zip")
    zipPath="$originalWorkingDir/$repo-$latestTag.zip"
    echo "正在下载源码... $downloadUrl"
    curl -L -o "$zipPath" "$downloadUrl"
    
    # 解压源码
    tmpDir="$originalWorkingDir/tmp"
    [ -d "$tmpDir" ] && rm -rf "$tmpDir"
    mkdir -p "$tmpDir"
    unzip -q "$zipPath" -d "$tmpDir"
    rm -f "$zipPath"
    
    # 移动文件
    tmpProjTagDir=$(find "$tmpDir" -maxdepth 1 -mindepth 1 -type d | head -n 1)
    [ -d "$realProjPath" ] && rm -rf "$realProjPath"
    mv "$tmpProjTagDir" "$realProjPath"
    rm -rf "$tmpDir"
    
    # 更新脚本和版本文件
    sourceScript="$realProjPath/deploy/online_scripts/linux.sh"
    [ -f "$sourceScript" ] && cp "$sourceScript" "$shScript"
    echo "✅ 代码已更换至新版..."
    
    # 安装依赖
    cd "$realProjPath" || exit
    echo "正在安装后端依赖..."
    uv sync --index-url https://repo.huaweicloud.com/repository/pypi/simple
    echo "正在安装前端依赖..."
    cd frontend || exit
    npm i

    cd "$originalWorkingDir" || exit
    echo $latestTag > $localVerFile
    echo "✅ 更新至版本: $latestTag"
}

# ===== 3. 运行函数 =====
start_redviewer() {
    [ ! -d "$realProjPath" ] && echo "❌ 项目目录不存在" && return
    cd "$originalWorkingDir"
    cd "$realProjPath" || exit
    printf "\n\033[33m🔖 TIP: 退出请直接关闭终端窗口\033[0m\n"
    echo "正在启动RedViewer..."
    
    # 启动后端
    uv run backend/app.py &
    backend_pid=$!
    
    # 启动前端
    cd frontend || exit
    npm run dev
    
    # 清理
    kill $backend_pid 2>/dev/null
    wait $backend_pid 2>/dev/null
}

# ===== 主程序 =====
# 检查环境
if test_environment; then
    echo "缺少必要环境，将优先安装..."
    install_environment
fi

# 检查更新
if [ ! -d "$realProjPath" ]; then
    latestTag=$(get_latestTag)
    updateInfo=("true" "$latestTag")
    invoke_update
else
    test_update
fi

# 用户选择菜单
while true; do
    printf "\n\033[36m╔══════════════════════════════════╗\033[0m\n"
    printf "\033[36m║              主菜单              ║\033[0m\n"
    printf "\033[36m╚══════════════════════════════════╝\033[0m\n\n"
    echo "1: ♻️ 更新/部署"
    echo "2: 🚀 运行"
    echo "3: 📡 只启动后端"
    echo "其他任意键: 🔚 退出\n"
    echo "请选择操作，5秒内无输入将自动尝试运行..."
    
    choice=""
    read -k 1 -t 5 choice
    if [ -z "$choice" ]; then
        choice="2"
    fi

    case $choice in
        1)
            if [ "${updateInfo[1]}" = "false" ]; then
                printf "\033[33m⏹️ 本地已是最新版本\033[0m\n"
                read -r "force?是否强制重新安装? (y/n) "
                [[ "$force" =~ ^[Yy]$ ]] || continue
                [ -d "$realProjPath" ] && rm -rf "$realProjPath"
            fi
            invoke_update
            ;;
        2)
            start_redviewer
            ;;
        3)
            [ ! -d "$realProjPath" ] && echo "❌ 项目目录不存在" && continue
            cd "$realProjPath/frontend" || exit
            npm run start-python
            ;;
        *)
            exit
            ;;
    esac
done