# 화면 테스트 공용: 확인(check)과 로컬 서버(테스트가 중간에 죽어도 서버가 남지 않게 atexit으로 끈다)
import atexit, os, subprocess, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(HERE, "..", "dist", "app")
OUT = os.path.join(HERE, "out") + "/"
os.makedirs(OUT, exist_ok=True)
n = 0
def check(cond, msg):
    global n; n += 1
    assert cond, msg
    print("ok", msg)
def serve(port, cwd=APP):
    p = subprocess.Popen([sys.executable, "-m", "http.server", str(port)], cwd=cwd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    atexit.register(lambda: p.poll() is None and p.kill())
    time.sleep(1)
    return p
def done(errs):
    print("checks:", n, "errors:", errs)
    assert not errs, errs
