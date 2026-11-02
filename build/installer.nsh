!include "${PROJECT_DIR}\.test-data\generated\build-number.nsh"
!define MUI_BGCOLOR "181918"
!define MUI_TEXTCOLOR "E3E6E2"
!define MUI_INSTFILESPAGE_COLORS "E3E6E2 222420"
SetFont "Segoe UI" 9
BrandingText "Krono"
# Bitmaps de marca são detectados pelo electron-builder nos nomes padrão.
!define MUI_HEADERIMAGE_BITMAP_NOSTRETCH
!define MUI_FINISHPAGE_TITLE "O Krono está pronto"
!define MUI_FINISHPAGE_TEXT "Abra o Krono para conhecer Foco, Hábitos e Produção.$\r$\n$\r$\nA apresentação é opcional e pode ser reaberta em Ajustes."
!ifndef BUILD_UNINSTALLER
!include version-policy.nsh
!include "${PROJECT_DIR}\build\setup-consent.nsh"
Var KronoUserVersion
Var KronoMachineVersion
Var KronoUserDecision
Var KronoMachineDecision
Var KronoInstallAction
Var KronoMetadataLocation
Var KronoMetadataUninstall

!macro KronoReadInstallation ROOT OUT
  ClearErrors
  ReadRegStr ${OUT} ${ROOT} "${UNINSTALL_REGISTRY_KEY}" "DisplayVersion"
  ${If} ${OUT} == ""
    ReadRegStr $KronoMetadataLocation ${ROOT} "${INSTALL_REGISTRY_KEY}" "InstallLocation"
    ReadRegStr $KronoMetadataUninstall ${ROOT} "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
    ${If} $KronoMetadataLocation != ""
    ${OrIf} $KronoMetadataUninstall != ""
      # Chave de instalação existente sem versão: recusar, não adivinhar.
      StrCpy ${OUT} "invalid"
    ${EndIf}
  ${EndIf}
!macroend

!macro customInit
  !insertmacro KronoReadInstallation HKCU $KronoUserVersion
  !insertmacro KronoReadInstallation HKLM $KronoMachineVersion
  StrCpy $KronoPolicyCandidate "${VERSION}"
  StrCpy $KronoPolicyInstalled $KronoUserVersion
  ReadRegStr $KronoInstalledBuild HKCU "${INSTALL_REGISTRY_KEY}" "KronoBuild"
  StrCpy $KronoCandidateBuild "${KRONO_BUILD_NUMBER}"
  Call KronoClassifyBuild
  StrCpy $KronoUserDecision $KronoPolicyDecision
  StrCpy $KronoPolicyInstalled $KronoMachineVersion
  ReadRegStr $KronoInstalledBuild HKLM "${INSTALL_REGISTRY_KEY}" "KronoBuild"
  Call KronoClassifyBuild
  StrCpy $KronoMachineDecision $KronoPolicyDecision
  ${If} $KronoUserDecision == "downgrade"
  ${OrIf} $KronoMachineDecision == "downgrade"
    IfSilent +2
      MessageBox MB_OK|MB_ICONSTOP "Uma versão mais recente do Krono já está instalada. Instalar ${VERSION} foi bloqueado para preservar os dados."
    SetErrorLevel 1638
    Quit
  ${EndIf}
  ${If} $KronoUserDecision == "invalid"
  ${OrIf} $KronoMachineDecision == "invalid"
    IfSilent +2
      MessageBox MB_OK|MB_ICONSTOP "Não foi possível confirmar a versão instalada do Krono. A instalação foi interrompida sem substituir o aplicativo."
    SetErrorLevel 13
    Quit
  ${EndIf}
  ${If} $KronoUserDecision == "legacy"
  ${OrIf} $KronoMachineDecision == "legacy"
    StrCpy $KronoLegacyRequired 1
    ${If} ${Silent}
      Call KronoReceiveConsent
      ${If} $KronoPipeApproved != 1
        SetErrorLevel 13
        Quit
      ${EndIf}
    ${EndIf}
      ${If} $KronoUserDecision == "legacy"
        StrCpy $KronoUserDecision "reinstall"
      ${EndIf}
      ${If} $KronoMachineDecision == "legacy"
        StrCpy $KronoMachineDecision "reinstall"
      ${EndIf}
  ${EndIf}
  StrCpy $KronoInstallAction "Instalar"
  ${If} $KronoUserDecision == "update"
  ${OrIf} $KronoMachineDecision == "update"
    StrCpy $KronoInstallAction "Atualizar"
  ${ElseIf} $KronoUserDecision == "reinstall"
  ${OrIf} $KronoMachineDecision == "reinstall"
    StrCpy $KronoInstallAction "Reinstalar"
  ${EndIf}
  ClearErrors
!macroend

!macro customWelcomePage
  # Funções da página precisam das macros MUI2 já carregadas pelo builder.
  !include "${PROJECT_DIR}\build\legacy-confirmation.nsh"
  !define MUI_WELCOMEPAGE_TITLE "$KronoInstallAction o Krono"
  !define MUI_WELCOMEPAGE_TEXT "Foco, hábitos e registros de estudo.$\r$\n$\r$\nKrono ${VERSION} · compilação ${KRONO_BUILD_NUMBER}$\r$\n$\r$\nEste assistente prepara os arquivos do aplicativo. Histórico e preferências não são redefinidos.$\r$\n$\r$\nFeche o Krono antes de continuar."
  !insertmacro MUI_PAGE_WELCOME
!macroend
!macro customPageAfterChangeDir
  Page custom KronoLegacyPage KronoLegacyLeave
  # Validação antes de executar a seção que desinstala/extrai arquivos.
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW KronoEnsureLegacyConsent
!macroend
!macro customInstall
  WriteRegStr SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" "KronoBuild" "${KRONO_BUILD_NUMBER}"
  WriteRegStr HKCU "Software\Classes\AppUserModelId\com.krono.desktop" "DisplayName" "Krono"
  WriteRegStr HKCU "Software\Classes\AppUserModelId\com.krono.desktop" "IconUri" "$INSTDIR\Krono.exe,0"
  WriteRegStr HKCU "Software\Classes\AppUserModelId\com.krono.desktop" "IconBackgroundColor" "00000000"
!macroend
!endif

!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\AppUserModelId\com.krono.desktop"
!macroend

# Nunca forçar encerramento de uma sessão para atualizar o aplicativo.
!macro customCheckAppRunning
  nsProcess::_FindProcess "Krono.exe"
  Pop $0
  ${If} $0 == 0
    SetErrorLevel 1618
    Quit
  ${EndIf}
!macroend
