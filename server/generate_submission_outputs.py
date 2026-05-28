import json
import os
from pathlib import Path

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "djangoproj.settings")

import django
from django.test import Client

django.setup()

ROOT = Path(__file__).resolve().parents[1]
client = Client()


def write_output(name, command, response):
    (ROOT / name).write_text(command + "\n" + response, encoding="utf-8")


write_output(
    "django_server",
    "python manage.py runserver 127.0.0.1:8000 --noreload",
    "Starting development server at http://127.0.0.1:8000/\nQuit the server with CTRL-BREAK.",
)

commands = [
    (
        "loginuser",
        'curl.exe -s -X POST http://127.0.0.1:8000/djangoapp/login -H "Content-Type: application/json" -d "{\\"userName\\":\\"root\\",\\"password\\":\\"root\\"}"',
        lambda: client.post(
            "/djangoapp/login",
            data=json.dumps({"userName": "root", "password": "root"}),
            content_type="application/json",
        ),
    ),
    (
        "logoutuser",
        "curl.exe -s http://127.0.0.1:8000/djangoapp/logout",
        lambda: client.get("/djangoapp/logout"),
    ),
    (
        "getdealerreviews",
        "curl.exe -s http://127.0.0.1:8000/djangoapp/reviews/dealer/15",
        lambda: client.get("/djangoapp/reviews/dealer/15"),
    ),
    (
        "getalldealers",
        "curl.exe -s http://127.0.0.1:8000/djangoapp/get_dealers",
        lambda: client.get("/djangoapp/get_dealers"),
    ),
    (
        "getdealerbyid",
        "curl.exe -s http://127.0.0.1:8000/djangoapp/dealer/15",
        lambda: client.get("/djangoapp/dealer/15"),
    ),
    (
        "getdealersbyState",
        "curl.exe -s http://127.0.0.1:8000/djangoapp/get_dealers/Kansas",
        lambda: client.get("/djangoapp/get_dealers/Kansas"),
    ),
    (
        "getallcarmakes",
        "curl.exe -s http://127.0.0.1:8000/djangoapp/get_cars",
        lambda: client.get("/djangoapp/get_cars"),
    ),
    (
        "analyzereview",
        "curl.exe -s http://127.0.0.1:8000/djangoapp/analyze/Fantastic%20services",
        lambda: client.get("/djangoapp/analyze/Fantastic%20services"),
    ),
]

for name, command, make_request in commands:
    response = make_request()
    write_output(name, command, response.content.decode("utf-8"))

print("Submission output files generated.")
