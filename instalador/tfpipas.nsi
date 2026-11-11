; Instalador do TF Pipas (Windows 10/11, 64 bits).
; Gerado com: makensis -DVERSAO=1.0.0 -DEXE=caminho/TFPipas.exe tfpipas.nsi
;
; - Instala só para o usuário atual (não pede senha de administrador) em
;   %LOCALAPPDATA%\Programs\TF Pipas.
; - Os dados ficam na pasta "dados" ao lado do programa e NUNCA são apagados
;   pelo desinstalador.
; - Antes de copiar (ou remover) o programa, desliga o TF Pipas se ele estiver
;   aberto, pedindo para ele fazer backup e fechar.

Target amd64-unicode
SetCompressor /SOLID lzma
SetCompressorDictSize 64

!ifndef VERSAO
  !define VERSAO "1.0.0"
!endif
!ifndef EXE
  !define EXE "..\backend\dist\TFPipas.exe"
!endif
!ifndef SAIDA
  !define SAIDA "saida\Instalar-TF-Pipas-${VERSAO}.exe"
!endif
!ifndef LEIAME
  !define LEIAME "LEIA-ME.txt"
!endif

!define NOME "TF Pipas"
!define CHAVE_DESINSTALAR "Software\Microsoft\Windows\CurrentVersion\Uninstall\TFPipas"
!define PORTA "4747"

!include "MUI2.nsh"
!include "x64.nsh"
!include "WinVer.nsh"
!include "FileFunc.nsh"
!include "LogicLib.nsh"

Name "${NOME}"
OutFile "${SAIDA}"
InstallDir "$LOCALAPPDATA\Programs\TF Pipas"
InstallDirRegKey HKCU "${CHAVE_DESINSTALAR}" "InstallLocation"
RequestExecutionLevel user
BrandingText "TF Pipas · Gestão da loja ${VERSAO}"
ShowInstDetails show
ShowUninstDetails show

VIProductVersion "${VERSAO}.0"
VIAddVersionKey /LANG=1046 "ProductName" "TF Pipas"
VIAddVersionKey /LANG=1046 "CompanyName" "TF Pipas"
VIAddVersionKey /LANG=1046 "FileDescription" "Instalador do TF Pipas (gestão da loja)"
VIAddVersionKey /LANG=1046 "FileVersion" "${VERSAO}"
VIAddVersionKey /LANG=1046 "ProductVersion" "${VERSAO}"
VIAddVersionKey /LANG=1046 "LegalCopyright" "TF Pipas"

; ---------------------------------------------------------------- aparência
!define MUI_ICON "tfpipas.ico"
!define MUI_UNICON "tfpipas.ico"
!define MUI_WELCOMEFINISHPAGE_BITMAP "painel-lateral.bmp"
!define MUI_UNWELCOMEFINISHPAGE_BITMAP "painel-lateral.bmp"
!define MUI_HEADERIMAGE
!define MUI_HEADERIMAGE_RIGHT
!define MUI_HEADERIMAGE_BITMAP "cabecalho.bmp"
!define MUI_HEADERIMAGE_UNBITMAP "cabecalho.bmp"
!define MUI_ABORTWARNING

!define MUI_WELCOMEPAGE_TITLE "Instalar o TF Pipas ${VERSAO}"
!define MUI_WELCOMEPAGE_TEXT "Sistema da loja TF Pipas: frente de caixa, produtos e estoque, controle de caixa, vendas, financeiro e relatórios.$\r$\n$\r$\nFunciona sem internet e guarda os dados neste computador.$\r$\n$\r$\nSe o TF Pipas estiver aberto, ele será fechado (com backup) antes de atualizar. Os dados da loja são mantidos.$\r$\n$\r$\nClique em Próximo para continuar."
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_COMPONENTS
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_TITLE "TF Pipas instalado"
!define MUI_FINISHPAGE_TEXT "Use o atalho TF Pipas da área de trabalho para abrir o sistema.$\r$\n$\r$\nLembre de copiar um backup para um pendrive toda semana (Configurações > Cópias de segurança)."
!define MUI_FINISHPAGE_RUN "$INSTDIR\TFPipas.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Abrir o TF Pipas agora"
!define MUI_FINISHPAGE_SHOWREADME "$INSTDIR\LEIA-ME.txt"
!define MUI_FINISHPAGE_SHOWREADME_TEXT "Ver as instruções (LEIA-ME)"
!define MUI_FINISHPAGE_SHOWREADME_NOTCHECKED
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "PortugueseBR"

; ---------------------------------------------------------------- funções
; Pede para o TF Pipas desligar (faz backup e fecha). Se não responder, encerra o processo.
!macro DesligarTFPipas
  DetailPrint "Fechando o TF Pipas, se estiver aberto…"
  nsExec::ExecToLog `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -Command "try { Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:${PORTA}/api/sistema/desligar' -Headers @{'x-tf-pipas'='1'} -TimeoutSec 5 | Out-Null; Start-Sleep -Seconds 3 } catch { }"`
  Pop $0
  nsExec::ExecToLog `taskkill /IM TFPipas.exe /F`
  Pop $0
  Sleep 800
!macroend

Function .onInit
  ${IfNot} ${RunningX64}
    MessageBox MB_ICONSTOP "O TF Pipas precisa do Windows de 64 bits."
    Abort
  ${EndIf}
  ${IfNot} ${AtLeastWin10}
    MessageBox MB_ICONSTOP "O TF Pipas precisa do Windows 10 ou mais novo."
    Abort
  ${EndIf}
FunctionEnd

; ---------------------------------------------------------------- seções
Section "TF Pipas (programa)" SecPrograma
  SectionIn RO
  !insertmacro DesligarTFPipas
  SetOutPath "$INSTDIR"
  File "/oname=TFPipas.exe" "${EXE}"
  File "tfpipas.ico"
  File "/oname=LEIA-ME.txt" "${LEIAME}"
  CreateDirectory "$INSTDIR\dados\backups"

  WriteUninstaller "$INSTDIR\Desinstalar TF Pipas.exe"

  CreateDirectory "$SMPROGRAMS\TF Pipas"
  CreateShortcut "$SMPROGRAMS\TF Pipas\TF Pipas.lnk" "$INSTDIR\TFPipas.exe" "" "$INSTDIR\tfpipas.ico" 0 SW_SHOWNORMAL "" "Abrir o sistema da loja"
  CreateShortcut "$SMPROGRAMS\TF Pipas\Pasta dos backups.lnk" "$INSTDIR\dados\backups" "" "" 0 SW_SHOWNORMAL "" "Cópias de segurança do banco de dados"
  CreateShortcut "$SMPROGRAMS\TF Pipas\Instruções (LEIA-ME).lnk" "$INSTDIR\LEIA-ME.txt"
  CreateShortcut "$SMPROGRAMS\TF Pipas\Desinstalar TF Pipas.lnk" "$INSTDIR\Desinstalar TF Pipas.exe"

  WriteRegStr HKCU "${CHAVE_DESINSTALAR}" "DisplayName" "TF Pipas"
  WriteRegStr HKCU "${CHAVE_DESINSTALAR}" "DisplayVersion" "${VERSAO}"
  WriteRegStr HKCU "${CHAVE_DESINSTALAR}" "Publisher" "TF Pipas"
  WriteRegStr HKCU "${CHAVE_DESINSTALAR}" "DisplayIcon" "$INSTDIR\tfpipas.ico"
  WriteRegStr HKCU "${CHAVE_DESINSTALAR}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${CHAVE_DESINSTALAR}" "UninstallString" '"$INSTDIR\Desinstalar TF Pipas.exe"'
  WriteRegDWORD HKCU "${CHAVE_DESINSTALAR}" "NoModify" 1
  WriteRegDWORD HKCU "${CHAVE_DESINSTALAR}" "NoRepair" 1
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKCU "${CHAVE_DESINSTALAR}" "EstimatedSize" "$0"
SectionEnd

Section "Atalho na área de trabalho" SecAtalho
  CreateShortcut "$DESKTOP\TF Pipas.lnk" "$INSTDIR\TFPipas.exe" "" "$INSTDIR\tfpipas.ico" 0 SW_SHOWNORMAL "" "Abrir o sistema da loja"
SectionEnd

Section /o "Abrir junto com o Windows" SecIniciar
  CreateShortcut "$SMSTARTUP\TF Pipas.lnk" "$INSTDIR\TFPipas.exe" "" "$INSTDIR\tfpipas.ico" 0 SW_SHOWNORMAL "" "Abrir o sistema da loja"
SectionEnd

!insertmacro MUI_FUNCTION_DESCRIPTION_BEGIN
  !insertmacro MUI_DESCRIPTION_TEXT ${SecPrograma} "O sistema da loja. Os dados ficam em $INSTDIR\dados."
  !insertmacro MUI_DESCRIPTION_TEXT ${SecAtalho} "Cria o atalho TF Pipas na área de trabalho."
  !insertmacro MUI_DESCRIPTION_TEXT ${SecIniciar} "Abre o TF Pipas sozinho quando o computador ligar."
!insertmacro MUI_FUNCTION_DESCRIPTION_END

; ---------------------------------------------------------------- desinstalação
Section "Uninstall"
  !insertmacro DesligarTFPipas
  Delete "$INSTDIR\TFPipas.exe"
  Delete "$INSTDIR\tfpipas.ico"
  Delete "$INSTDIR\LEIA-ME.txt"
  Delete "$INSTDIR\Desinstalar TF Pipas.exe"
  Delete "$DESKTOP\TF Pipas.lnk"
  Delete "$SMSTARTUP\TF Pipas.lnk"
  RMDir /r "$SMPROGRAMS\TF Pipas"
  DeleteRegKey HKCU "${CHAVE_DESINSTALAR}"
  ; A pasta "dados" (banco e backups) fica: RMDir sem /r só remove pasta vazia.
  RMDir "$INSTDIR"
  ${If} ${FileExists} "$INSTDIR\dados\*.*"
    MessageBox MB_ICONINFORMATION "O TF Pipas foi removido.$\r$\n$\r$\nOs dados da loja (vendas, produtos e backups) foram mantidos em:$\r$\n$INSTDIR\dados$\r$\n$\r$\nSe reinstalar, o sistema volta com eles."
  ${EndIf}
SectionEnd
