import json
from urllib.parse import parse_qs, urlparse

from app.routers import instagram


class FakeResponse:
    def __init__(self, payload):
        self.payload = json.dumps(payload).encode()

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return None

    def read(self):
        return self.payload


def test_instagram_feed_is_empty_when_not_configured(client, monkeypatch):
    monkeypatch.setattr(instagram, "env", lambda name, default="": "")

    response = client.get("/instagram/videos")

    assert response.status_code == 200
    assert response.json() == {"configured": False, "videos": [], "next_cursor": ""}


def test_instagram_feed_uses_server_token_and_returns_video_posts(client, monkeypatch):
    monkeypatch.setattr(
        instagram,
        "env",
        lambda name, default="": {
            "INSTAGRAM_ACCESS_TOKEN": "private-test-token",
            "INSTAGRAM_USER_ID": "123456",
        }.get(name, default),
    )
    instagram._cache.clear()
    captured = {}

    def fake_urlopen(request, timeout):
        captured["url"] = request.full_url
        captured["authorization"] = request.get_header("Authorization")
        captured["timeout"] = timeout
        return FakeResponse(
            {
                "data": [
                    {
                        "id": "video-1",
                        "caption": "A property tour\nMore details",
                        "media_type": "VIDEO",
                        "permalink": "https://www.instagram.com/reel/abc123/",
                        "thumbnail_url": "https://cdn.example/video.jpg",
                    },
                    {
                        "id": "image-1",
                        "media_type": "IMAGE",
                        "permalink": "https://www.instagram.com/p/xyz789/",
                    },
                    {
                        "id": "carousel-1",
                        "media_type": "CAROUSEL_ALBUM",
                        "children": {"data": [{"media_type": "VIDEO"}]},
                        "permalink": "https://www.instagram.com/p/carousel1/",
                    },
                ],
                "paging": {"next": "https://graph.facebook.com/next", "cursors": {"after": "next-cursor"}},
            }
        )

    monkeypatch.setattr(instagram, "urlopen", fake_urlopen)

    response = client.get("/instagram/videos")

    assert response.status_code == 200
    result = response.json()
    assert result["configured"] is True
    assert [video["id"] for video in result["videos"]] == ["instagram-video-1", "instagram-carousel-1"]
    assert result["videos"][0]["title"] == "A property tour"
    assert result["videos"][0]["channel"] == "Instagram"
    assert result["next_cursor"] == "next-cursor"
    assert captured["authorization"] == "Bearer private-test-token"
    assert "private-test-token" not in captured["url"]
    assert "access_token" not in captured["url"]
    assert captured["timeout"] == 10


def test_instagram_feed_rejects_partial_credentials(client, monkeypatch):
    monkeypatch.setattr(
        instagram,
        "env",
        lambda name, default="": {
            "INSTAGRAM_ACCESS_TOKEN": "private-test-token",
        }.get(name, default),
    )

    response = client.get("/instagram/videos")

    assert response.status_code == 503
    assert response.json()["detail"] == "Instagram feed credentials are incomplete."


def test_instagram_feed_forwards_pagination_cursor(client, monkeypatch):
    monkeypatch.setattr(
        instagram,
        "env",
        lambda name, default="": {
            "INSTAGRAM_ACCESS_TOKEN": "private-test-token",
            "INSTAGRAM_USER_ID": "123456",
        }.get(name, default),
    )
    instagram._cache.clear()
    captured = {}

    def fake_urlopen(request, timeout):
        captured["url"] = request.full_url
        return FakeResponse({"data": []})

    monkeypatch.setattr(instagram, "urlopen", fake_urlopen)

    response = client.get("/instagram/videos", params={"after": "next cursor"})

    assert response.status_code == 200
    assert parse_qs(urlparse(captured["url"]).query)["after"] == ["next cursor"]
