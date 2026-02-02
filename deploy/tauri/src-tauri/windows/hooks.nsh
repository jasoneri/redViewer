; NSIS Installer Hooks for rV (redViewer)
; Implements mirror selection and Python dependency installation
;
; Architecture:
; - Mirror selection uses Page custom (included after Welcome page via custom template)
; - NSIS_HOOK_PREINSTALL: Command line parsing only
; - NSIS_HOOK_POSTINSTALL: Config saving and dependency installation
; - NSIS_HOOK_PREUNINSTALL: (empty)
; - NSIS_HOOK_POSTUNINSTALL: Optional cleanup

!include "nsDialogs.nsh"
!include "LogicLib.nsh"
!include "FileFunc.nsh"
!include "WordFunc.nsh"

; Variables
Var MirrorChoice
Var MirrorPage
Var MirrorRadioGlobal
Var MirrorRadioCN
Var ExistingMirror
Var ForceDeps
Var DepsInstalled
Var CmdLineMirror
Var MirrorPageSkipped    ; Track if page was skipped (for Back button handling)
Var MirrorPageVisited    ; Track if page was ever visited

; Constants
!define CONFIG_DIR "$LOCALAPPDATA\redViewer"
!define MIRROR_FILE "${CONFIG_DIR}\mirror.json"
!define STATUS_FILE "${CONFIG_DIR}\install_status.json"

; Language strings - fallback defaults (English)
!ifndef MIRROR_PAGE_TITLE
  !define MIRROR_PAGE_TITLE "Python Mirror Selection"
!endif
!ifndef MIRROR_PAGE_SUBTITLE
  !define MIRROR_PAGE_SUBTITLE "Select the Python package mirror source"
!endif
!ifndef MIRROR_GLOBAL_TEXT
  !define MIRROR_GLOBAL_TEXT "Global (github/python-build-standalone, PyPI)"
!endif
!ifndef MIRROR_CN_TEXT
  !define MIRROR_CN_TEXT "China (NJU, huaweicloud pypi)"
!endif
!ifndef DEPS_INSTALLING
  !define DEPS_INSTALLING "Installing Python dependencies..."
!endif
!ifndef DEPS_SUCCESS
  !define DEPS_SUCCESS "Python dependencies installed successfully."
!endif
!ifndef DEPS_FAILED
  !define DEPS_FAILED "Warning: Python dependency installation failed."
!endif
!ifndef DEPS_FAILED_HINT
  !define DEPS_FAILED_HINT "The application will prompt you to fix this on first launch."
!endif

;------------------------------------------------------------------------------
; Custom Page Declaration (included after Welcome page via custom template)
;------------------------------------------------------------------------------
Page custom MirrorPageCreate MirrorPageLeave

;------------------------------------------------------------------------------
; Mirror Page Create Function
; Called when the installer navigates to this page
;------------------------------------------------------------------------------
Function MirrorPageCreate
  ; Initialize default (only on first visit)
  ${If} $MirrorPageVisited != "1"
    StrCpy $MirrorChoice "global"
    StrCpy $ExistingMirror ""
    StrCpy $CmdLineMirror ""
    StrCpy $MirrorPageSkipped "0"

    ; Parse command line for /MIRROR=
    ${GetParameters} $0
    ${GetOptions} $0 "/MIRROR=" $1
    ${IfNot} ${Errors}
      ${If} $1 == "global"
      ${OrIf} $1 == "cn"
        StrCpy $CmdLineMirror $1
        StrCpy $MirrorChoice $1
      ${EndIf}
    ${EndIf}

    ; Check for existing mirror.json (upgrade scenario)
    ${If} ${FileExists} "${MIRROR_FILE}"
      FileOpen $0 "${MIRROR_FILE}" r
      FileRead $0 $1
      FileClose $0
      ; Simple JSON parsing: extract "mirror": "value"
      ${WordFind} $1 '"mirror"' "+1}" $2
      ${WordFind} $2 '"' "+1" $3
      ${WordFind} $3 '"' "+1" $ExistingMirror
      ${If} $ExistingMirror == "global"
      ${OrIf} $ExistingMirror == "cn"
        StrCpy $MirrorChoice $ExistingMirror
      ${Else}
        ; Invalid value, clear it so page is shown
        StrCpy $ExistingMirror ""
      ${EndIf}
    ${EndIf}
  ${EndIf}

  ; Mark page as visited
  StrCpy $MirrorPageVisited "1"

  ; Skip page conditions (only if not returning via Back button):
  ; 1. Silent mode
  ; 2. Command line specified mirror
  ; 3. Existing config (upgrade scenario)
  ; But if page was previously skipped and user pressed Back, show the page
  ${If} $MirrorPageSkipped == "1"
    ; User pressed Back to return to this page - show it instead of skipping again
    StrCpy $MirrorPageSkipped "0"
    Goto show_mirror_page
  ${EndIf}

  IfSilent mark_skip_and_abort
  ${If} $CmdLineMirror != ""
    Goto mark_skip_and_abort
  ${EndIf}
  ${If} $ExistingMirror != ""
    Goto mark_skip_and_abort
  ${EndIf}
  Goto show_mirror_page

  mark_skip_and_abort:
    StrCpy $MirrorPageSkipped "1"
    Abort

  show_mirror_page:
  ; Show the mirror selection page
  !insertmacro MUI_HEADER_TEXT "${MIRROR_PAGE_TITLE}" "${MIRROR_PAGE_SUBTITLE}"

  nsDialogs::Create 1018
  Pop $MirrorPage
  ${If} $MirrorPage == error
    Abort
  ${EndIf}

  ; Create description label
  ${NSD_CreateLabel} 20 10 400 30 "Select the Python package download source. China for speed up chinese users"
  Pop $0

  ; Create radio buttons
  ${NSD_CreateRadioButton} 20 60 400 20 "${MIRROR_GLOBAL_TEXT}"
  Pop $MirrorRadioGlobal
  ${NSD_CreateRadioButton} 20 90 400 20 "${MIRROR_CN_TEXT}"
  Pop $MirrorRadioCN

  ; Set default selection based on current choice
  ${If} $MirrorChoice == "cn"
    ${NSD_Check} $MirrorRadioCN
  ${Else}
    ${NSD_Check} $MirrorRadioGlobal
  ${EndIf}

  nsDialogs::Show
FunctionEnd

;------------------------------------------------------------------------------
; Mirror Page Leave Function
; Called when user clicks Next/Install on this page
;------------------------------------------------------------------------------
Function MirrorPageLeave
  ; Get user selection from radio buttons
  ${NSD_GetState} $MirrorRadioCN $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $MirrorChoice "cn"
  ${Else}
    StrCpy $MirrorChoice "global"
  ${EndIf}
FunctionEnd

;------------------------------------------------------------------------------
; PREINSTALL Hook
; Called at the beginning of Section Install, before file copy
; Only handles command line parsing for /FORCE_DEPS flag
;------------------------------------------------------------------------------
!macro NSIS_HOOK_PREINSTALL
  ; Initialize ForceDeps
  StrCpy $ForceDeps "0"

  ; Parse command line for /FORCE_DEPS
  ${GetParameters} $0
  ${GetOptions} $0 "/FORCE_DEPS" $1
  ${IfNot} ${Errors}
    StrCpy $ForceDeps "1"
  ${EndIf}
!macroend

;------------------------------------------------------------------------------
; POSTINSTALL Hook
; Called after file copy, registry setup, and shortcut creation
; Handles config saving and dependency installation
;------------------------------------------------------------------------------
!macro NSIS_HOOK_POSTINSTALL
  ; Create config directory
  CreateDirectory "${CONFIG_DIR}"

  ; Write mirror.json
  FileOpen $0 "${MIRROR_FILE}" w
  FileWrite $0 '{"mirror": "$MirrorChoice"}'
  FileClose $0

  ; Check if deps already installed (upgrade scenario)
  StrCpy $DepsInstalled "0"
  ${If} ${FileExists} "${STATUS_FILE}"
    FileOpen $0 "${STATUS_FILE}" r
    FileRead $0 $1
    FileClose $0
    ${WordFind} $1 '"deps_installed"' "+1}" $2
    ${WordFind} $2 ':' "+1" $3
    ${If} $3 == " true"
    ${OrIf} $3 == "true"
      StrCpy $DepsInstalled "1"
    ${EndIf}
  ${EndIf}

  ; Skip deps install if already done and not forced
  ${If} $DepsInstalled == "1"
  ${AndIf} $ForceDeps == "0"
    Goto skip_deps_install
  ${EndIf}

  ; Determine config file based on mirror choice
  ${If} $MirrorChoice == "cn"
    StrCpy $1 "cn.toml"
  ${Else}
    StrCpy $1 "global.toml"
  ${EndIf}

  ; Execute rvInstaller.exe
  DetailPrint "${DEPS_INSTALLING}"
  nsExec::ExecToLog '"$INSTDIR\rvInstaller.exe" /i /pyenv $1'
  Pop $0

  ; Write install_status.json based on result
  ${If} $0 == "0"
    FileOpen $0 "${STATUS_FILE}" w
    FileWrite $0 '{"deps_installed": true, "error": null}'
    FileClose $0
    DetailPrint "${DEPS_SUCCESS}"
  ${Else}
    FileOpen $0 "${STATUS_FILE}" w
    FileWrite $0 '{"deps_installed": false, "error": "rvInstaller exit code: $0"}'
    FileClose $0
    DetailPrint "${DEPS_FAILED} (exit code: $0)"
    DetailPrint "${DEPS_FAILED_HINT}"
  ${EndIf}

  skip_deps_install:
!macroend

;------------------------------------------------------------------------------
; PREUNINSTALL Hook
;------------------------------------------------------------------------------
!macro NSIS_HOOK_PREUNINSTALL
  ; No special logic needed
!macroend

;------------------------------------------------------------------------------
; POSTUNINSTALL Hook
;------------------------------------------------------------------------------
!macro NSIS_HOOK_POSTUNINSTALL
  ; Clean up runtime-generated files only on full uninstall (not upgrade)
  ${If} $UpdateMode <> 1
    Delete /REBOOTOK "$INSTDIR\res\src\uv.lock"
    RMDir /r /REBOOTOK "$INSTDIR\res\src\.venv"
    RMDir /r /REBOOTOK "$INSTDIR\res"
    RMDir /REBOOTOK "$INSTDIR"
  ${EndIf}
!macroend
