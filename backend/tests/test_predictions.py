def test_prediction_options_and_metrics_are_public(client):
    options = client.get("/predictions/options")
    metrics = client.get("/predictions/metrics")

    assert options.status_code == 200
    assert options.json()["success"] is True
    assert len(options.json()["options"]["location"]) == 5
    assert metrics.status_code == 200
    assert metrics.json()["sample_count"] == 996
    assert 0 < metrics.json()["mape_pct"] < 100


def test_prediction_returns_estimate_range_and_metrics(client):
    response = client.post("/predictions", json={
        "location": "Gurgaon",
        "locality": "Golf Course Road",
        "property_type": "Apartment",
        "area": 1800,
        "bedrooms": 3,
        "bathrooms": 3,
        "floor": 8,
        "total_floors": 20,
        "property_age": 2,
        "parking": 1,
        "lift": "Yes",
        "furnishing": "Semi-Furnished",
        "facing": "North",
        "balcony": 2,
        "amenities": "Gym, Swimming Pool",
        "amenities_count": 2,
        "gated_community": "Yes",
        "security": "Yes",
        "power_backup": "Yes",
        "water_supply": "24x7",
        "property_status": "Ready to Move",
        "metro_distance": 2,
        "school_distance": 1,
        "hospital_distance": 2,
        "main_road_distance": 1,
    })

    assert response.status_code == 200, response.text
    result = response.json()
    assert result["predicted_price"] > 0
    assert result["min_price"] <= result["predicted_price"] <= result["max_price"]
    assert result["metrics"]["validation_rows"] == 200


def test_prediction_rejects_unknown_locality(client):
    response = client.post("/predictions", json={
        "location": "Gurgaon",
        "locality": "Not a real training locality",
        "property_type": "Apartment",
        "area": 1800,
        "bedrooms": 3,
        "bathrooms": 3,
    })

    assert response.status_code == 422
