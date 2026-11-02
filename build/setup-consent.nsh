!ifndef KRONO_SETUP_CONSENT
!define KRONO_SETUP_CONSENT
!include FileFunc.nsh
!include LogicLib.nsh
Var KronoPipeNonce
Var KronoPipeIndex
Var KronoPipeCharacter
Var KronoPipeResult
Var KronoPipeReply
Var KronoPipeBytes
Var KronoPipeRequest
Var KronoPipeRequestLength
Var KronoPipeApproved
Function KronoReceiveConsent
  StrCpy $KronoPipeApproved 0
  ${GetParameters} $KronoPipeRequest
  ${GetOptions} $KronoPipeRequest "/KRONO_UI_PIPE=" $KronoPipeNonce
  StrLen $KronoPipeIndex $KronoPipeNonce
  ${If} $KronoPipeIndex != 32
    Return
  ${EndIf}
  StrCpy $KronoPipeIndex 0
  validate:
    StrCpy $KronoPipeCharacter $KronoPipeNonce 1 $KronoPipeIndex
    StrCmp $KronoPipeCharacter "" exchange
    StrCmp $KronoPipeCharacter "0" valid
    StrCmp $KronoPipeCharacter "1" valid
    StrCmp $KronoPipeCharacter "2" valid
    StrCmp $KronoPipeCharacter "3" valid
    StrCmp $KronoPipeCharacter "4" valid
    StrCmp $KronoPipeCharacter "5" valid
    StrCmp $KronoPipeCharacter "6" valid
    StrCmp $KronoPipeCharacter "7" valid
    StrCmp $KronoPipeCharacter "8" valid
    StrCmp $KronoPipeCharacter "9" valid
    StrCmp $KronoPipeCharacter "a" valid
    StrCmp $KronoPipeCharacter "b" valid
    StrCmp $KronoPipeCharacter "c" valid
    StrCmp $KronoPipeCharacter "d" valid
    StrCmp $KronoPipeCharacter "e" valid
    StrCmp $KronoPipeCharacter "f" valid
    Return
  valid:
    IntOp $KronoPipeIndex $KronoPipeIndex + 1
    Goto validate
  exchange:
    StrCpy $KronoPipeRequest "legacy:${VERSION}:${KRONO_BUILD_NUMBER}"
    StrLen $KronoPipeRequestLength $KronoPipeRequest
    IntOp $KronoPipeRequestLength $KronoPipeRequestLength + 1
    IntOp $KronoPipeRequestLength $KronoPipeRequestLength * 2
    System::Call 'kernel32::CallNamedPipeW(w "\\.\pipe\Krono.Setup.$KronoPipeNonce", w "$KronoPipeRequest", i $KronoPipeRequestLength, w .r0, i 512, *i .r1, i 5000) i.r2'
    StrCpy $KronoPipeReply $0
    StrCpy $KronoPipeBytes $1
    StrCpy $KronoPipeResult $2
    ${If} $KronoPipeResult != 0
    ${AndIf} $KronoPipeReply == "accepted:${VERSION}:${KRONO_BUILD_NUMBER}"
      StrCpy $KronoPipeApproved 1
    ${EndIf}
FunctionEnd
!endif
