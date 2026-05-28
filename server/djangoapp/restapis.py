import json
import os
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv()

backend_url = os.getenv('backend_url', default="http://localhost:3030")
sentiment_analyzer_url = os.getenv(
    'sentiment_analyzer_url',
    default="http://localhost:5050/")

BASE_DIR = Path(__file__).resolve().parents[1]
DATABASE_DATA_DIR = BASE_DIR / "database" / "data"
FALLBACK_REVIEWS_FILE = DATABASE_DATA_DIR / "posted_reviews.json"


def _load_json_file(filename, key):
    with open(DATABASE_DATA_DIR / filename, encoding="utf-8") as data_file:
        return json.load(data_file)[key]


def _load_posted_reviews():
    if not FALLBACK_REVIEWS_FILE.exists():
        return []
    with open(FALLBACK_REVIEWS_FILE, encoding="utf-8") as data_file:
        return json.load(data_file).get("reviews", [])


def _save_posted_review(data_dict):
    posted_reviews = _load_posted_reviews()
    posted_review = dict(data_dict)
    posted_review["id"] = 1000 + len(posted_reviews)
    posted_reviews.append(posted_review)
    with open(FALLBACK_REVIEWS_FILE, "w", encoding="utf-8") as data_file:
        json.dump({"reviews": posted_reviews}, data_file, indent=2)
    return posted_review


def _fallback_get(endpoint):
    if endpoint == "/fetchDealers":
        return _load_json_file("dealerships.json", "dealerships")
    if endpoint.startswith("/fetchDealers/"):
        state = endpoint.rsplit("/", 1)[1]
        dealers = _load_json_file("dealerships.json", "dealerships")
        return dealers if state == "All" else [dealer for dealer in dealers if dealer["state"] == state]
    if endpoint.startswith("/fetchDealer/"):
        dealer_id = int(endpoint.rsplit("/", 1)[1])
        return [dealer for dealer in _load_json_file("dealerships.json", "dealerships") if dealer["id"] == dealer_id]
    if endpoint.startswith("/fetchReviews/dealer/"):
        dealer_id = int(endpoint.rsplit("/", 1)[1])
        reviews = [review for review in _load_json_file("reviews.json", "reviews") if review["dealership"] == dealer_id]
        reviews.extend([review for review in _load_posted_reviews() if review["dealership"] == dealer_id])
        return reviews
    if endpoint == "/fetchReviews":
        return _load_json_file("reviews.json", "reviews")
    return []


def get_request(endpoint, **kwargs):
    params = ""
    if kwargs:
        params = "?" + "&".join([f"{key}={value}" for key, value in kwargs.items()])
    request_url = backend_url + endpoint + params
    try:
        response = requests.get(request_url, timeout=0.3)
        response.raise_for_status()
        return response.json()
    except requests.RequestException:
        return _fallback_get(endpoint)


def analyze_review_sentiments(text):
    request_url = sentiment_analyzer_url + "analyze/" + text
    try:
        response = requests.get(request_url, timeout=0.3)
        response.raise_for_status()
        return response.json().get("sentiment", "neutral")
    except requests.RequestException:
        positive_words = {"great", "excellent", "good", "amazing", "fantastic", "love", "best", "helpful"}
        negative_words = {"bad", "poor", "terrible", "awful", "worst", "slow", "rude", "hate"}
        lowered = text.lower()
        if any(word in lowered for word in positive_words):
            return "positive"
        if any(word in lowered for word in negative_words):
            return "negative"
        return "neutral"


def post_review(data_dict):
    request_url = backend_url + "/insert_review"
    try:
        response = requests.post(request_url, json=data_dict, timeout=0.3)
        response.raise_for_status()
        return response.json()
    except requests.RequestException:
        return _save_posted_review(data_dict)
