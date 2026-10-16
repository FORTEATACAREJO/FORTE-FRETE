#!/usr/bin/env python3
"""Install the real APK and require its unauthenticated login in an emulator.

Does not enter credentials, create accounts, or change operational data.
"""
import pathlib
import subprocess
import sys
import time
import xml.etree.ElementTree as ET

PACKAGE = "br.com.forteatacarejo.frete"
OUTPUT = pathlib.Path("android-launch-results")


def adb(*args, check=True):
    return subprocess.run(["adb", *args], check=check, capture_output=True, timeout=30)


def login_visible(xml):
    root = ET.fromstring(xml)
    labels = " ".join(
        node.get("text", "") + " " + node.get("content-desc", "")
        for node in root.iter("node")
    ).casefold()
    return "cpf" in labels and "senha cadastrada" in labels and "entrar" in labels


def main():
    OUTPUT.mkdir(exist_ok=True)
    adb("install", "-r", sys.argv[1])
    adb("shell", "pm", "grant", PACKAGE, "android.permission.POST_NOTIFICATIONS")
    adb("logcat", "-c")
    adb("shell", "am", "start", "-W", "-n", PACKAGE + "/.MainActivity")
    deadline = time.monotonic() + 120
    passed = False
    try:
        while time.monotonic() < deadline:
            adb("shell", "uiautomator", "dump", "/sdcard/forte-launch.xml", check=False)
            result = adb("shell", "cat", "/sdcard/forte-launch.xml", check=False)
            if result.returncode == 0 and result.stdout.lstrip().startswith(b"<?xml"):
                (OUTPUT / "login-ui.xml").write_bytes(result.stdout)
                try:
                    passed = login_visible(result.stdout)
                except ET.ParseError:
                    passed = False
                if passed:
                    break
            time.sleep(3)
    finally:
        screen = adb("exec-out", "screencap", "-p", check=False)
        if screen.stdout.startswith(b"\x89PNG\r\n\x1a\n"):
            (OUTPUT / "ForteFrete-Android-Tela-Teste.png").write_bytes(screen.stdout)
        logs = adb("logcat", "-d", "-s", "AndroidRuntime:E", check=False).stdout
        (OUTPUT / "android-runtime.txt").write_bytes(logs)
    if not passed:
        raise SystemExit("Login inicial não apareceu em 120 segundos; confira a captura e os diagnósticos.")
    foreground = adb("shell", "dumpsys", "activity", "activities").stdout.decode(errors="replace")
    if not any(PACKAGE in line for line in foreground.splitlines() if "mResumedActivity" in line or "topResumedActivity" in line):
        raise SystemExit("Aplicativo não está em primeiro plano.")
    if b"FATAL EXCEPTION" in logs:
        raise SystemExit("Emulador registrou falha AndroidRuntime durante a abertura.")
    print("APK instalado e login CPF/senha/ENTRAR visível. Captura salva; fluxos autenticados permanecem pendentes.")


if __name__ == "__main__":
    main()
