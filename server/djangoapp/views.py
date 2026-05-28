import json
import logging

from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt

from .models import CarModel
from .restapis import analyze_review_sentiments, get_request, post_review

logger = logging.getLogger(__name__)


@csrf_exempt
def login_user(request):
    data = json.loads(request.body)
    username = data['userName']
    password = data['password']
    user = authenticate(username=username, password=password)
    data = {"userName": username}
    if user is not None:
        login(request, user)
        data = {
            "userName": username,
            "firstName": user.first_name,
            "lastName": user.last_name,
            "status": "Authenticated",
        }
    return JsonResponse(data)


def logout_request(request):
    logout(request)
    return JsonResponse({"userName": ""})


@csrf_exempt
def registration(request):
    data = json.loads(request.body)
    username = data["userName"]
    password = data["password"]
    email = data["email"]
    first_name = data["firstName"]
    last_name = data["lastName"]

    if User.objects.filter(username=username).exists():
        return JsonResponse({"userName": username, "error": "Already Registered"})

    user = User.objects.create_user(
        username=username,
        password=password,
        email=email,
        first_name=first_name,
        last_name=last_name,
    )
    login(request, user)
    return JsonResponse({
        "userName": username,
        "firstName": first_name,
        "lastName": last_name,
        "status": "Registered",
    })


def get_dealerships(request, state="All"):
    endpoint = "/fetchDealers" if state == "All" else f"/fetchDealers/{state}"
    dealerships = get_request(endpoint)
    return JsonResponse({"status": 200, "dealers": dealerships})


def fetch_dealers_by_state(request, state):
    dealerships = get_request(f"/fetchDealers/{state}")
    response = [_dealer_submission_fields(dealer) for dealer in dealerships]
    return JsonResponse(response, safe=False)


def fetch_dealer_by_id(request, dealer_id):
    dealer = get_request(f"/fetchDealer/{dealer_id}")
    response = [_dealer_submission_fields(dealer_obj) for dealer_obj in dealer]
    return JsonResponse(response, safe=False)


def _dealer_submission_fields(dealer):
    return {
        "id": dealer["id"],
        "city": dealer["city"],
        "state": dealer["state"],
        "address": dealer["address"],
        "zip": dealer["zip"],
        "lat": dealer["lat"],
        "long": dealer["long"],
        "short_name": dealer["short_name"],
        "full_name": dealer["full_name"],
    }


def get_dealer_details(request, dealer_id):
    dealer = get_request(f"/fetchDealer/{dealer_id}")
    return JsonResponse({"status": 200, "dealer": dealer})


def get_dealer_reviews(request, dealer_id):
    reviews = get_request(f"/fetchReviews/dealer/{dealer_id}")
    for review in reviews:
        review["sentiment"] = analyze_review_sentiments(review["review"])
    return JsonResponse({"status": 200, "reviews": reviews})


def get_cars(request):
    cars = CarModel.objects.select_related("car_make").all()
    car_models = [
        {
            "CarMake": car.car_make.name,
            "CarModel": car.name,
            "CarType": car.type,
            "CarYear": car.year,
        }
        for car in cars
    ]
    return JsonResponse({"status": 200, "CarModels": car_models})


def analyze_review(request, review_text):
    return JsonResponse({"sentiment": analyze_review_sentiments(review_text)})


@csrf_exempt
def add_review(request):
    data = json.loads(request.body)
    data["dealership"] = int(data["dealership"])
    data["car_year"] = int(data["car_year"])
    data["sentiment"] = analyze_review_sentiments(data["review"])
    post_review(data)
    return JsonResponse({"status": 200})
