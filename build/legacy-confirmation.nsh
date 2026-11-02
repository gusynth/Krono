!ifndef KRONO_LEGACY_CONFIRMATION
!define KRONO_LEGACY_CONFIRMATION
!include nsDialogs.nsh
!include LogicLib.nsh

Var KronoLegacyRequired
Var KronoLegacyAccepted
Var KronoLegacyDialog
Var KronoLegacyCheck
Var KronoLegacyNext
Var KronoLegacyControl
Var KronoLegacyFont

Function KronoLegacyChanged
  Pop $KronoLegacyControl
  ${NSD_GetState} $KronoLegacyCheck $KronoLegacyAccepted
  EnableWindow $KronoLegacyNext $KronoLegacyAccepted
FunctionEnd

Function KronoLegacyPage
  ${If} $KronoLegacyRequired != 1
    Abort
  ${EndIf}
  !insertmacro MUI_HEADER_TEXT "Reinstalação do Krono" "Confira a instalação anterior antes de continuar."
  nsDialogs::Create 1018
  Pop $KronoLegacyDialog
  ${If} $KronoLegacyDialog == error
    # Falhar fechado: Abort pularia uma página de confirmação obrigatória.
    SetErrorLevel 13
    Quit
  ${EndIf}
  SetCtlColors $KronoLegacyDialog F5F5F7 0C0C0E
  SetCtlColors $HWNDPARENT F5F5F7 0C0C0E
  GetDlgItem $KronoLegacyControl $HWNDPARENT 1028
  SetCtlColors $KronoLegacyControl A1A1AA 0C0C0E
  GetDlgItem $KronoLegacyControl $HWNDPARENT 1256
  SetCtlColors $KronoLegacyControl A1A1AA 0C0C0E
  ${NSD_CreateLabel} 0 4u 100% 25u "Uma confirmação antes de continuar"
  Pop $KronoLegacyControl
  CreateFont $KronoLegacyFont "Segoe UI" 14 600
  SendMessage $KronoLegacyControl ${WM_SETFONT} $KronoLegacyFont 1
  SetCtlColors $KronoLegacyControl F5F5F7 0C0C0E
  ${NSD_CreateLabel} 0 35u 100% 30u "A instalação atual não informa o número da compilação. Por isso, não podemos confirmar se este pacote é mais recente."
  Pop $KronoLegacyControl
  SetCtlColors $KronoLegacyControl A1A1AA 0C0C0E
  ${NSD_CreateLabel} 0 72u 100% 29u "Feche o Krono e confira seu backup. Continuar tratará este pacote como uma reinstalação, sem confirmar que ele é uma atualização."
  Pop $KronoLegacyControl
  SetCtlColors $KronoLegacyControl F5F5F7 0C0C0E
  ${NSD_CreateCheckbox} 0 110u 100% 24u "&Entendi e quero continuar como reinstalação"
  Pop $KronoLegacyCheck
  # O tema visual nativo de checkbox ignora a cor de texto em fundos escuros.
  System::Call 'uxtheme::SetWindowTheme(p $KronoLegacyCheck, w "", w "")'
  SetCtlColors $KronoLegacyCheck F5F5F7 0C0C0E
  # Voltar à página sempre exige nova escolha explícita.
  StrCpy $KronoLegacyAccepted 0
  ${NSD_SetState} $KronoLegacyCheck ${BST_UNCHECKED}
  ${NSD_OnClick} $KronoLegacyCheck KronoLegacyChanged
  GetDlgItem $KronoLegacyNext $HWNDPARENT 1
  EnableWindow $KronoLegacyNext 0
  ${NSD_SetFocus} $KronoLegacyCheck
  nsDialogs::Show
  EnableWindow $KronoLegacyNext 1
  System::Call 'gdi32::DeleteObject(p $KronoLegacyFont)'
FunctionEnd

Function KronoLegacyLeave
  ${If} $KronoLegacyRequired == 1
    ${NSD_GetState} $KronoLegacyCheck $KronoLegacyAccepted
    ${If} $KronoLegacyAccepted != ${BST_CHECKED}
      Abort
    ${EndIf}
  ${EndIf}
FunctionEnd

Function KronoEnsureLegacyConsent
  ${If} $KronoLegacyRequired == 1
  ${AndIf} $KronoLegacyAccepted != ${BST_CHECKED}
    SetErrorLevel 13
    Quit
  ${EndIf}
FunctionEnd
!endif
