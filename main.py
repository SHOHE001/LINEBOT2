import os
from dotenv import load_dotenv
import requests
from flask import Flask, request, abort

load_dotenv()

from linebot.v3 import WebhookHandler
from linebot.v3.exceptions import InvalidSignatureError
from linebot.v3.messaging import (
    Configuration, ApiClient, MessagingApi, MessagingApiBlob,
    ReplyMessageRequest, TextMessage
)
from linebot.v3.webhooks import MessageEvent, ImageMessageContent, VideoMessageContent

# 必須環境変数の検証
_required_env = [
    'LINE_CHANNEL_ACCESS_TOKEN',
    'LINE_CHANNEL_SECRET',
    'NEXTCLOUD_URL',
    'NEXTCLOUD_USER',
    'NEXTCLOUD_PASSWORD',
]
_missing = [k for k in _required_env if not os.environ.get(k)]
if _missing:
    raise EnvironmentError(f"必須の環境変数が未設定です: {', '.join(_missing)}")

configuration = Configuration(access_token=os.environ.get('LINE_CHANNEL_ACCESS_TOKEN'))
handler = WebhookHandler(os.environ.get('LINE_CHANNEL_SECRET'))

app = Flask(__name__)

REQUEST_TIMEOUT = int(os.environ.get('NEXTCLOUD_TIMEOUT', '30'))


def upload_to_nextcloud(remote_path: str, file_content_bytes: bytes) -> bool:
    """Nextcloudの指定パスにファイルをアップロードする。フォルダが存在しない場合は作成する。"""
    nextcloud_url = os.environ.get("NEXTCLOUD_URL").rstrip('/')
    nextcloud_user = os.environ.get("NEXTCLOUD_USER")
    auth = (nextcloud_user, os.environ.get("NEXTCLOUD_PASSWORD"))

    dir_to_create = os.path.dirname(remote_path)
    dirs = list(dict.fromkeys(["/LINE_BOT", dir_to_create]))  # 重複を除去しつつ順序保持

    for d in dirs:
        dir_url = f"{nextcloud_url}/remote.php/dav/files/{nextcloud_user}{d}"
        try:
            response = requests.request("MKCOL", dir_url, auth=auth, timeout=REQUEST_TIMEOUT)
        except requests.exceptions.Timeout:
            app.logger.error(f"フォルダ作成タイムアウト: {d}")
            return False
        except requests.exceptions.RequestException as e:
            app.logger.error(f"フォルダ作成リクエストエラー: {d}, {e}")
            return False

        # 405 = 既に存在する（正常）、201 = 作成成功
        if response.status_code not in [201, 405]:
            app.logger.error(f"フォルダ作成に失敗: {d}, Status: {response.status_code}, Resp: {response.text}")
            return False

    upload_url = f"{nextcloud_url}/remote.php/dav/files/{nextcloud_user}{remote_path}"
    try:
        response = requests.put(upload_url, data=file_content_bytes, auth=auth, timeout=REQUEST_TIMEOUT)
    except requests.exceptions.Timeout:
        app.logger.error(f"アップロードタイムアウト: {remote_path}")
        return False
    except requests.exceptions.RequestException as e:
        app.logger.error(f"アップロードリクエストエラー: {remote_path}, {e}")
        return False

    if response.status_code in [201, 204]:
        return True

    app.logger.error(f"Nextcloudへのアップロードに失敗。ステータスコード: {response.status_code}, 応答: {response.text}")
    return False


def reply_text(reply_token: str, text: str) -> None:
    with ApiClient(configuration) as api_client:
        MessagingApi(api_client).reply_message(
            ReplyMessageRequest(
                reply_token=reply_token,
                messages=[TextMessage(text=text)],
            )
        )


@app.route("/callback", methods=['POST'])
def callback():
    signature = request.headers.get('X-Line-Signature')
    if not signature:
        abort(400)

    body = request.get_data(as_text=True)
    app.logger.info("Request body: " + body)

    try:
        handler.handle(body, signature)
    except InvalidSignatureError:
        abort(400)
    return 'OK'


@handler.add(MessageEvent, message=(ImageMessageContent, VideoMessageContent))
def handle_media_message(event):
    with ApiClient(configuration) as api_client:
        messaging_api_blob = MessagingApiBlob(api_client)
        user_id = event.source.user_id
        message_id = event.message.id
        reply_token = event.reply_token

        file_extension = "jpg" if isinstance(event.message, ImageMessageContent) else "mp4"
        remote_path = f"/LINE_BOT/{user_id}/{message_id}.{file_extension}"

        try:
            file_bytes = messaging_api_blob.get_message_content(message_id)
        except Exception as e:
            app.logger.error(f"LINEからのコンテンツ取得に失敗: {e}")
            reply_text(reply_token, "ファイルの取得に失敗しました。もう一度お試しください。")
            return

        if upload_to_nextcloud(remote_path, file_bytes):
            app.logger.info(f"Nextcloudに保存成功: {remote_path}")
            reply_text(reply_token, "保存しました！")
        else:
            app.logger.error(f"Nextcloudへの保存失敗: {remote_path}")
            reply_text(reply_token, "保存に失敗しました。しばらく経ってからお試しください。")


if __name__ == "__main__":
    app.run(
        port=int(os.environ.get('PORT', '8000')),
        debug=os.environ.get('FLASK_DEBUG', 'false').lower() == 'true',
    )
