import os
from dotenv import load_dotenv

# .envファイルを読み込む
load_dotenv()

# .envファイルから値を取得して表示
print("LINE_CHANNEL_ACCESS_TOKEN:", os.environ.get('LINE_CHANNEL_ACCESS_TOKEN'))
print("LINE_CHANNEL_SECRET:", os.environ.get('LINE_CHANNEL_SECRET'))

import requests
from flask import Flask, request, abort
from linebot import LineBotApi, WebhookHandler
from linebot.exceptions import InvalidSignatureError
from linebot.models import MessageEvent, ImageMessage, VideoMessage

# 環境変数からトークンとシークレットを取得
line_bot_api = LineBotApi(os.environ.get('LINE_CHANNEL_ACCESS_TOKEN'))
handler = WebhookHandler(os.environ.get('LINE_CHANNEL_SECRET'))

app = Flask(__name__)

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

# 画像メッセージを処理するハンドラー
@handler.add(MessageEvent, message=ImageMessage)
def handle_image_message(event):
    # === ここから変更・追加 ===
    # 1. 送信者のユーザーIDを取得
    user_id = event.source.user_id
    # 2. ユーザーIDを使って、LINEにプロフィール情報を問い合わせる
    profile = line_bot_api.get_profile(user_id)
    # 3. プロフィール情報から表示名を取得
    user_name = profile.display_name
    # === ここまで変更・追加 ===

    message_id = event.message.id
    message_content = line_bot_api.get_message_content(message_id)
    
    # === 保存先のパスをユーザー名を含むように変更 ===
    # ベースフォルダとユーザー名のフォルダを結合して保存先ディレクトリを作成
    # 例: './images/Taro Yamada'
    save_dir = os.path.join('./images', user_name)
    if not os.path.exists(save_dir):
        os.makedirs(save_dir)
    
    file_path = os.path.join(save_dir, f'{message_id}.jpg')
    # === 変更はここまで ===

    with open(file_path, 'wb') as f:
        for chunk in message_content.iter_content():
            f.write(chunk)
            
    print(f'画像が保存されました: {file_path}')

# 動画メッセージを処理するハンドラー
@handler.add(MessageEvent, message=VideoMessage)
def handle_video_message(event):
    # === ここから変更・追加 ===
    # 1. 送信者のユーザーIDを取得
    user_id = event.source.user_id
    # 2. ユーザーIDを使って、LINEにプロフィール情報を問い合わせる
    profile = line_bot_api.get_profile(user_id)
    # 3. プロフィール情報から表示名を取得
    user_name = profile.display_name
    # === ここまで変更・追加 ===
    
    message_id = event.message.id
    message_content = line_bot_api.get_message_content(message_id)
    
    # === 保存先のパスをユーザー名を含むように変更 ===
    # ベースフォルダとユーザー名のフォルダを結合して保存先ディレクトリを作成
    # 例: './videos/Taro Yamada'
    save_dir = os.path.join('./videos', user_name)
    if not os.path.exists(save_dir):
        os.makedirs(save_dir)
        
    file_path = os.path.join(save_dir, f'{message_id}.mp4')
    # === 変更はここまで ===

    with open(file_path, 'wb') as f:
        for chunk in message_content.iter_content():
            f.write(chunk)
            
    print(f'動画が保存されました: {file_path}')

if __name__ == "__main__":
    app.run(port=8000)