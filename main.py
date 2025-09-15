# 必要なライブラリをインポート
import os
from dotenv import load_dotenv
import requests  # Nextcloudとの通信はこれ一本に絞る
from flask import Flask, request, abort

# .envファイルから環境変数を読み込む
load_dotenv()

# V3のLINE Bot SDKライブラリをインポート
from linebot.v3 import WebhookHandler
from linebot.v3.exceptions import InvalidSignatureError
from linebot.v3.messaging import Configuration, ApiClient, MessagingApiBlob
from linebot.v3.webhooks import MessageEvent, ImageMessageContent, VideoMessageContent

# --- LINE Bot APIの設定 ---
configuration = Configuration(access_token=os.environ.get('LINE_CHANNEL_ACCESS_TOKEN'))
handler = WebhookHandler(os.environ.get('LINE_CHANNEL_SECRET'))

# --- Flaskアプリの準備 ---
app = Flask(__name__)


def upload_to_nextcloud(remote_path, file_content_bytes):
    """
    Nextcloudの指定パスにファイルをアップロードする。（requestsライブラリ完全版）
    フォルダが存在しない場合は自動で作成する。
    """
    try:
        nextcloud_url = os.environ.get("NEXTCLOUD_URL").rstrip('/')
        nextcloud_user = os.environ.get("NEXTCLOUD_USER")
        auth = (nextcloud_user, os.environ.get("NEXTCLOUD_PASSWORD"))

        # --- フォルダ作成処理 (requests版) ---
        # 作成するフォルダのパスをリスト化: ['/LINE_BOT', '/LINE_BOT/U...']
        dir_to_create = os.path.dirname(remote_path)
        dirs = ["/LINE_BOT", dir_to_create]

        for d in dirs:
            dir_url = f"{nextcloud_url}/remote.php/dav/files/{nextcloud_user}{d}"
            # MKCOLメソッドでフォルダ作成をリクエスト
            response = requests.request("MKCOL", dir_url, auth=auth)
            # 405 Method Not Allowed は「既に存在する」という意味なので成功とみなす
            if response.status_code not in [201, 405]:
                print(f"フォルダ作成に失敗: {d}, Status: {response.status_code}, Resp: {response.text}")

        # --- ファイルアップロード処理 (変更なし) ---
        upload_url = f"{nextcloud_url}/remote.php/dav/files/{nextcloud_user}{remote_path}"
        response = requests.put(upload_url, data=file_content_bytes, auth=auth)

        # 成功判定を「201 Created」と「204 No Content」のみに戻す
        if response.status_code in [201, 204]:
            return True
        else:
            print(f"Nextcloudへのアップロードに失敗。ステータスコード: {response.status_code}, 応答: {response.text}")
            return False

    except Exception as e:
        print(f"Nextcloudへのアップロード処理中に予期せぬエラーが発生: {e}")
        return False

@app.route("/callback", methods=['POST'])
def callback():
    signature = request.headers['X-Line-Signature']
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
        
        file_extension = "jpg" if isinstance(event.message, ImageMessageContent) else "mp4"
        remote_path = f"/LINE_BOT/{user_id}/{message_id}.{file_extension}"
        
        try:
            file_bytes = messaging_api_blob.get_message_content(message_id)
            if upload_to_nextcloud(remote_path, file_bytes):
                print(f'成功: Nextcloudに保存されました。 Path: {remote_path}')
            else:
                print(f'失敗: Nextcloudへの保存に失敗しました。 Path: {remote_path}')
        except Exception as e:
            print(f"メッセージ処理中にエラーが発生: {e}")

if __name__ == "__main__":
    app.run(port=8000, debug=True)