import os
from dotenv import load_dotenv

# .envファイルを読み込む
load_dotenv()

# .envファイルから値を取得して表示
print("LINE_CHANNEL_ACCESS_TOKEN:", os.environ.get('LINE_CHANNEL_ACCESS_TOKEN'))
print("LINE_CHANNEL_SECRET:", os.environ.get('LINE_CHANNEL_SECRET'))

# 以下、既存のコード...

import os
import requests
from flask import Flask, request, abort
from linebot import LineBotApi, WebhookHandler
from linebot.exceptions import InvalidSignatureError
from linebot.models import MessageEvent, ImageMessage

# 環境変数からトークンとシークレットを取得
# os.environ.get('YOUR_CHANNEL_ACCESS_TOKEN')
# YOUR_CHANNEL_ACCESS_TOKEN の部分に直接文字列を貼り付けます
line_bot_api = LineBotApi(os.environ.get('LINE_CHANNEL_ACCESS_TOKEN'))
handler = WebhookHandler(os.environ.get('LINE_CHANNEL_SECRET'))

app = Flask(__name__)

# Webhookからのリクエストを処理するエンドポイント
@app.route("/callback", methods=['POST'])
def callback():
    # リクエストヘッダーから署名を取得
    signature = request.headers['X-Line-Signature']
    # リクエストボディを取得
    body = request.get_data(as_text=True)
    app.logger.info("Request body: " + body)
    
    try:
        # 署名を検証し、イベントを処理
        handler.handle(body, signature)
    except InvalidSignatureError:
        # 署名が無効な場合は400エラーを返す
        abort(400)

    return 'OK'

# 画像メッセージを処理するハンドラー
@handler.add(MessageEvent, message=ImageMessage)
def handle_image_message(event):
    # 画像メッセージのコンテンツIDを取得
    message_id = event.message.id
    
    # 画像コンテンツを取得
    message_content = line_bot_api.get_message_content(message_id)
    
    # 画像をローカルに保存
    # 保存先フォルダが存在しない場合は作成
    save_dir = './images'
    if not os.path.exists(save_dir):
        os.makedirs(save_dir)
    
    # ファイル名を設定
    file_path = os.path.join(save_dir, f'{message_id}.jpg')
    
    # 画像データをファイルに書き込み
    with open(file_path, 'wb') as f:
        for chunk in message_content.iter_content():
            f.write(chunk)
            
    print(f'画像が保存されました: {file_path}')

# アプリケーションの起動
if __name__ == "__main__":
    app.run(port=8000)