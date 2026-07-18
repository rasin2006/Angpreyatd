#School's Info

Name: សាលាពុទ្ធិកបឋមសិក្សាសម្តេច នន្ទ ង៉ែត អង្គប្រីយ៍​ (Nun Nget AngPrey Buddhist Primary School)
Locate : ភូមិ ប្រសៀត ឃុំលំចង់ ស្រុកសំរោង ខេត្តតាកែវ
(.venv) PS C:\Users\K.S\Pictures\NFC-V1.2.0> $env:FLASK_APP = "app.py"                                   
(.venv) PS C:\Users\K.S\Pictures\NFC-V1.2.0> flask run --host=0.0.0.0 --port=8080  

Progress: plan created. Next I'll summarize causes and concise solutions.

once we run this http://172.20.10.3:8080/checkin?uid=0DF8B1EC it should request the checkin just like the physical scan. after a successful check-in it should auto go to attendance report for that student

Quick/low-risk: change maybe_browser_ok(..., default_status=400) to default 200 so the server always returns 200 for devices (I can patch this now).
Cleaner: add a device-focused endpoint (e.g. /api/scan) that accepts ESP32 requests and always returns JSON 200 while updating LAST_SCAN_DATA — leaves browser UX unchanged. I can add this and keep /checkin behavior intact.
Alternative: make the ESP32 include a header (or Referer) so is_browser_request() is true (if you control the device).

172.20.10.2 - - [14/May/2026 16:13:10] "GET /write/pending HTTP/1.1" 200 -
172.20.10.2 - - [14/May/2026 16:13:17] "GET /checkin?uid=0DF8B1EC HTTP/1.1" 400 -
172.20.10.1 - - [14/May/2026 16:13:17] "GET /api/student/APY5001-A1 HTTP/1.1" 200 -
172.20.10.1 - - [14/May/2026 16:13:17] "GET /api/student/APY5001-A1 HTTP/1.1" 200 -
172.20.10.1 - - [14/May/2026 16:13:17] "GET /photos/APY5001-A1.jpeg HTTP/1.1" 200 -
172.20.10.1 - - [14/May/2026 16:13:17] "GET /api/student/APY5001-A1 HTTP/1.1" 200 -
172.20.10.1 - - [14/May/2026 16:13:18] "GET /resource/sound/error.wav HTTP/1.1" 206 -172.20.10.1 - - [14/May/2026 16:13:18] "GET /resource/sound/error.wav HTTP/1.1" 206 -172.20.10.2 - - [14/May/2026 16:13:19] "GET /write/pending HTTP/1.1" 200 -

run the server then i'll scan the card and we look for the bugs and a what's could go wrong

inginglim2006@gmail.com
Hope@2026
gibse1-zebcoh-Jipcyp
visal30092005@gmail.com
09684163880968416388
172.20.10.3:8080/checkin?uid=0DF8B1EC

 error: subprocess-exited-with-error
  
  × Getting requirements to build wheel did not run successfully.
  │ exit code: 1
  ╰─> [20 lines of output]
      Traceback (most recent call last):
        File "C:\Users\rasin\AppData\Local\Packages\PythonSoftwareFoundation.Python.3.12_qbz5n2kfra8p0\LocalCache\local-packages\Python312\site-packages\pip\_vendor\pyproject_hooks\_in_process\_in_process.py", line 389, in <module>
          main()
        File "C:\Users\rasin\AppData\Local\Packages\PythonSoftwareFoundation.Python.3.12_qbz5n2kfra8p0\LocalCache\local-packages\Python312\site-packages\pip\_vendor\pyproject_hooks\_in_process\_in_process.py", line 373, in main
          json_out["return_val"] = hook(**hook_input["kwargs"])
                                   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^
        File "C:\Users\rasin\AppData\Local\Packages\PythonSoftwareFoundation.Python.3.12_qbz5n2kfra8p0\LocalCache\local-packages\Python312\site-packages\pip\_vendor\pyproject_hooks\_in_process\_in_process.py", line 143, in get_requires_for_build_wheel
          return hook(config_settings)
                 ^^^^^^^^^^^^^^^^^^^^^
        File "C:\Users\rasin\AppData\Local\Temp\pip-build-env-h1j0n3aj\overlay\Lib\site-packages\setuptools\build_meta.py", line 333, in get_requires_for_build_wheel
                 ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
        File "C:\Users\rasin\AppData\Local\Temp\pip-build-env-h1j0n3aj\overlay\Lib\site-packages\setuptools\build_meta.py", line 301, in _get_build_requires
          self.run_setup()
        File "C:\Users\rasin\AppData\Local\Temp\pip-build-env-h1j0n3aj\overlay\Lib\site-packages\setuptools\build_meta.py", line 520, in run_setup
          super().run_setup(setup_script=setup_script)
        File "C:\Users\rasin\AppData\Local\Temp\pip-build-env-h1j0n3aj\overlay\Lib\site-packages\setuptools\build_meta.py", line 317, in run_setup
          exec(code, locals())
        File "<string>", line 19, in <module>
      ModuleNotFoundError: No module named 'pkg_resources'
      [end of output]
  
  note: This error originates from a subprocess, and is likely not a problem with pip.
ERROR: Failed to build 'pandas' when getting requirements to build wheel
PS C:\Users\K.S\Pictures\NFC-V1.2.0> pip3 install -r requirements.txt
Defaulting to user installation because normal site-packages is not writeable
Collecting Flask==2.3.3 (from -r requirements.txt (line 1))
  Using cached flask-2.3.3-py3-none-any.whl.metadata (3.6 kB)
Collecting openpyxl==3.1.2 (from -r requirements.txt (line 2))
  Using cached openpyxl-3.1.2-py2.py3-none-any.whl.metadata (2.5 kB)
Collecting Werkzeug==2.3.7 (from -r requirements.txt (line 3))
  Using cached werkzeug-2.3.7-py3-none-any.whl.metadata (4.1 kB)
Collecting pandas==2.0.3 (from -r requirements.txt (line 4))
  Using cached pandas-2.0.3.tar.gz (5.3 MB)
  Installing build dependencies ... done
  Getting requirements to build wheel ... error
  error: subprocess-exited-with-error
  
  × Getting requirements to build wheel did not run successfully.
  │ exit code: 1
  ╰─> [20 lines of output]
      Traceback (most recent call last):
        File "C:\Users\rasin\AppData\Local\Packages\PythonSoftwareFoundation.Python.3.12_qbz5n2kfra8p0\LocalCache\local-packages\Python312\site-packages\pip\_vendor\pyproject_hooks\_in_process\_in_process.py", line 389, in <module>
          main()
        File "C:\Users\rasin\AppData\Local\Packages\PythonSoftwareFoundation.Python.3.12_qbz5n2kfra8p0\LocalCache\local-packages\Python312\site-packages\pip\_vendor\pyproject_hooks\_in_process\_in_process.py", line 373, in main
          json_out["return_val"] = hook(**hook_input["kwargs"])
                                   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^
        File "C:\Users\rasin\AppData\Local\Packages\PythonSoftwareFoundation.Python.3.12_qbz5n2kfra8p0\LocalCache\local-packages\Python312\site-packages\pip\_vendor\pyproject_hooks\_in_process\_in_process.py", line 143, in get_requires_for_build_wheel
          return hook(config_settings)
                 ^^^^^^^^^^^^^^^^^^^^^
        File "C:\Users\rasin\AppData\Local\Temp\pip-build-env-v0rrjxgl\overlay\Lib\site-packages\setuptools\build_meta.py", line 333, in get_requires_for_build_wheel
          return self._get_build_requires(config_settings, requirements=[])
                 ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
        File "C:\Users\rasin\AppData\Local\Temp\pip-build-env-v0rrjxgl\overlay\Lib\site-packages\setuptools\build_meta.py", line 301, in _get_build_requires
          self.run_setup()
        File "C:\Users\rasin\AppData\Local\Temp\pip-build-env-v0rrjxgl\overlay\Lib\site-packages\setuptools\build_meta.py", line 520, in run_setup
          super().run_setup(setup_script=setup_script)
        File "C:\Users\rasin\AppData\Local\Temp\pip-build-env-v0rrjxgl\overlay\Lib\site-packages\setuptools\build_meta.py", line 317, in run_setup
          exec(code, locals())
        File "<string>", line 19, in <module>
      ModuleNotFoundError: No module named 'pkg_resources'
      [end of output]
  
  note: This error originates from a subprocess, and is likely not a problem with pip.
ERROR: Failed to build 'pandas' when getting requirements to build wheel


python -m pip install --upgrade pip setuptools wheel
python -m pip install -r requirements.txt

py -3 -m pip install --upgrade pip setuptools wheel
py -3 -m pip install -r requirements.txt

pip install --only-binary :all: pandas==2.0.3

conda create -n nfc python=3.10 pandas=2.0.3 flask openpyxl werkzeug
conda activate nfc
pip install -r requirements.txt