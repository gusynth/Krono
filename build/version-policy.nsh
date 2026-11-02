!ifndef KRONO_VERSION_POLICY_INCLUDED
!define KRONO_VERSION_POLICY_INCLUDED
!include LogicLib.nsh
!include WordFunc.nsh

Var KronoVersionInput
Var KronoVersionValid
Var KronoVersionIndex
Var KronoVersionCharacter
Var KronoVersionParts
Var KronoVersionDigits
Var KronoVersionNumber
Var KronoPolicyInstalled
Var KronoPolicyCandidate
Var KronoPolicyDecision
Var KronoPolicyComparison
Var KronoInstalledBuild
Var KronoCandidateBuild

# Contrato do instalador: três componentes decimais canônicos, 0..65535.
# Metadado desconhecido não autoriza sobrescrever uma instalação.
Function KronoValidateVersion
  StrCpy $KronoVersionValid 0
  StrCpy $KronoVersionIndex 0
  StrCpy $KronoVersionParts 0
  StrCpy $KronoVersionDigits 0
  StrCpy $KronoVersionNumber 0
  loop:
    StrCpy $KronoVersionCharacter $KronoVersionInput 1 $KronoVersionIndex
    StrCmp $KronoVersionCharacter "" end
    StrCmp $KronoVersionCharacter "." separator
    StrCmp $KronoVersionCharacter "0" digit
    StrCmp $KronoVersionCharacter "1" digit
    StrCmp $KronoVersionCharacter "2" digit
    StrCmp $KronoVersionCharacter "3" digit
    StrCmp $KronoVersionCharacter "4" digit
    StrCmp $KronoVersionCharacter "5" digit
    StrCmp $KronoVersionCharacter "6" digit
    StrCmp $KronoVersionCharacter "7" digit
    StrCmp $KronoVersionCharacter "8" digit
    StrCmp $KronoVersionCharacter "9" digit
    Return
  digit:
    ${If} $KronoVersionDigits > 0
    ${AndIf} $KronoVersionNumber == 0
      Return
    ${EndIf}
    IntOp $KronoVersionDigits $KronoVersionDigits + 1
    ${If} $KronoVersionDigits > 5
      Return
    ${EndIf}
    IntOp $KronoVersionNumber $KronoVersionNumber * 10
    IntOp $KronoVersionNumber $KronoVersionNumber + $KronoVersionCharacter
    ${If} $KronoVersionNumber > 65535
      Return
    ${EndIf}
    Goto advance
  separator:
    ${If} $KronoVersionDigits == 0
      Return
    ${EndIf}
    IntOp $KronoVersionParts $KronoVersionParts + 1
    ${If} $KronoVersionParts > 2
      Return
    ${EndIf}
    StrCpy $KronoVersionDigits 0
    StrCpy $KronoVersionNumber 0
  advance:
    IntOp $KronoVersionIndex $KronoVersionIndex + 1
    Goto loop
  end:
    ${If} $KronoVersionParts == 2
    ${AndIf} $KronoVersionDigits > 0
      StrCpy $KronoVersionValid 1
    ${EndIf}
FunctionEnd

# Número de compilação canônico positivo, 1..65535. Hash não determina ordem.
Function KronoClassifyBuild
  StrCpy $KronoVersionInput "$KronoCandidateBuild.0.0"
  Call KronoValidateVersion
  ${If} $KronoVersionValid != 1
  ${OrIf} $KronoCandidateBuild == "0"
    StrCpy $KronoPolicyDecision "invalid"
    Return
  ${EndIf}
  ${If} $KronoInstalledBuild != ""
    StrCpy $KronoVersionInput "$KronoInstalledBuild.0.0"
    Call KronoValidateVersion
    ${If} $KronoVersionValid != 1
    ${OrIf} $KronoInstalledBuild == "0"
    ${OrIf} $KronoPolicyInstalled == ""
      StrCpy $KronoPolicyDecision "invalid"
      Return
    ${EndIf}
  ${EndIf}
  Call KronoClassifyVersion
  ${If} $KronoPolicyDecision != "reinstall"
    Return
  ${EndIf}
  ${If} $KronoInstalledBuild == ""
    StrCpy $KronoPolicyDecision "legacy"
    Return
  ${EndIf}
  ${If} $KronoInstalledBuild < $KronoCandidateBuild
    StrCpy $KronoPolicyDecision "update"
  ${ElseIf} $KronoInstalledBuild > $KronoCandidateBuild
    StrCpy $KronoPolicyDecision "downgrade"
  ${EndIf}
FunctionEnd

Function KronoClassifyVersion
  StrCpy $KronoPolicyDecision "invalid"
  StrCpy $KronoVersionInput $KronoPolicyCandidate
  Call KronoValidateVersion
  ${If} $KronoVersionValid != 1
    Return
  ${EndIf}
  ${If} $KronoPolicyInstalled == ""
    StrCpy $KronoPolicyDecision "install"
    Return
  ${EndIf}
  StrCpy $KronoVersionInput $KronoPolicyInstalled
  Call KronoValidateVersion
  ${If} $KronoVersionValid != 1
    Return
  ${EndIf}
  ${VersionCompare} "$KronoPolicyInstalled" "$KronoPolicyCandidate" $KronoPolicyComparison
  ${If} $KronoPolicyComparison == 0
    StrCpy $KronoPolicyDecision "reinstall"
  ${ElseIf} $KronoPolicyComparison == 1
    StrCpy $KronoPolicyDecision "downgrade"
  ${ElseIf} $KronoPolicyComparison == 2
    StrCpy $KronoPolicyDecision "update"
  ${EndIf}
FunctionEnd
!endif
