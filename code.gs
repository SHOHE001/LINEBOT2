// --- 設定の読み込み ---
var props = PropertiesService.getScriptProperties();
var CHANNEL_ACCESS_TOKEN = props.getProperty("LINE_ACCESS_TOKEN");
var ROOT_FOLDER_ID = props.getProperty("ROOT_FOLDER_ID");
var MY_USER_ID = props.getProperty("MY_USER_ID"); 
var SECRET_LOG_SS_ID = "1Spq2DKIev2sR8leJDJ2kS5kVaFbhRL5YUuIlmU-PLw4";

var ERROR_CONTACT_MSG = "\n\n解決しない場合は /contact [内容] で管理者へお問い合わせください。";

function doPost(e) {
  var replyTokenForError = "";
  try {
    if (!e || !e.postData) return;
    var json = JSON.parse(e.postData.contents);
    if (!json.events) return;

    for (var i = 0; i < json.events.length; i++) {
      var event = json.events[i];
      var replyToken = event.replyToken;
      replyTokenForError = replyToken;
      var source = event.source;
      var sourceId = source.groupId || source.roomId || source.userId;
      var userId = source.userId;
      var userName = getUserName(sourceId, userId, source.type);
      var chatName = getBaseName(source);
      var time = timestamp();

      if (event.type === "message") {
        var msgType = event.message.type;
        if (msgType === "video" || msgType === "image" || msgType === "file") {
          var originalName = (msgType === "file") ? event.message.fileName : null;
          saveMediaToDrive(event.message.id, replyToken, msgType, source, originalName, sourceId, userName);    
          logToSecretSheet(time, chatName, userName, "MEDIA: " + msgType, "(Saved to Drive)");
        } else if (msgType === "text") {
          var text = event.message.text;
          logToSecretSheet(time, chatName, userName, "TEXT", text);
          if (text.indexOf("/rename ") === 0) handleRenameCommand(text.substring(8).trim(), replyToken, sourceId, source);
          else if (text.indexOf("/memo ") === 0) handleMemoCommand(text.substring(6).trim(), replyToken, sourceId, source);
          else if (text.indexOf("/contact ") === 0) handleContactCommand(text.substring(9).trim(), replyToken, userName, source);
          else if (text === "/link") handleLinkCommand(replyToken, source, sourceId);
          else if (text === "/help") sendHelp(replyToken);
          else if (text === "/commands") sendDetailedCommands(replyToken);
          else if (text === "/list") sendList(replyToken, source, sourceId);
          else if (text === "/delete") handleDeleteCommand(replyToken, sourceId);
          else if (text === "/debug") handleDebugCommand(replyToken, source, sourceId);
          else if (text.indexOf("/reply ") === 0) handleReplyModeCommand(text.substring(7).trim(), replyToken, sourceId, source);
        }
      }
    }
  } catch (err) {
    var errMsg = err.toString();
    if (replyTokenForError) replyMessage(replyTokenForError, "⚠️ システムエラー:\n" + errMsg + ERROR_CONTACT_MSG);
    var adminId = props.getProperty("MY_USER_ID");
    if (adminId) pushMessage(adminId, "🚨 エラー通知: " + errMsg);
  }
}

function timestamp() { return Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy/MM/dd HH:mm:ss"); }

function logToSecretSheet(time, chatName, userName, type, content) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    var ss = SpreadsheetApp.openById(SECRET_LOG_SS_ID);
    var safeSheetName = (chatName || "Unknown").substring(0, 31).replace(/[\\\/\[\]\?\*]/g, "");
    var sheet = ss.getSheetByName(safeSheetName);
    if (!sheet) {
      sheet = ss.insertSheet(safeSheetName);
      sheet.appendRow(["日時", "チャット名", "ユーザー名", "種別", "内容"]);
      sheet.setFrozenRows(1);
    }
    sheet.appendRow([time, chatName, userName, type, content]);
    SpreadsheetApp.flush();
  } catch (e) {
    var adminId = props.getProperty("MY_USER_ID");
    if (adminId) pushMessage(adminId, "🚨 SecretLog Error: " + e.toString());
  } finally {
    lock.releaseLock();
  }
}

function handleRenameCommand(commandText, replyToken, sourceId, source) {
  if (!commandText.trim()) {
    replyMessage(replyToken, "💡 名前を指定してください。\n例: /rename 旅行の写真");
    return;
  }
  try {
    var args = commandText.split(/\s+/);
    var dateString = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyyMMdd");
    var groupFolder = getOrCreateGroupFolder(source, sourceId);
    var dateFolders = groupFolder.getFoldersByName(dateString);
    if (!dateFolders.hasNext()) throw new Error("本日のファイルが見つかりません。");
    var targetFolder = dateFolders.next();
    var ss = getOrCreateSpreadsheet(source, sourceId);
    var chatName = getBaseName(source);
    var sheet = ss.getSheetByName(chatName);

    var files = [];
    var fileIt = targetFolder.getFiles();
    while(fileIt.hasNext()) { files.push(fileIt.next()); }
    files.sort(function(a, b) { return b.getLastUpdated() - a.getLastUpdated(); });

    if (args[0].toLowerCase() === "all") {
      var baseName = args.slice(1).join(" ");
      if (!baseName) throw new Error("名前を指定してください。");
      for (var i = 0; i < files.length; i++) {
        var ext = files[i].getName().substring(files[i].getName().lastIndexOf("."));
        var newName = baseName + "_" + (files.length - i) + ext;
        files[i].setName(newName);
        updateSSFileName(sheet, files[i].getId(), newName);
      }
      replyMessage(replyToken, "✅ 本日の全 " + files.length + " 件を一括リネームしました。");
    } else if (args[0].toLowerCase() === "last" && !isNaN(args[1]) && args.length > 2) {
      var count = parseInt(args[1]);
      var baseName = args.slice(2).join(" ");
      var limit = Math.min(count, files.length);
      for (var i = 0; i < limit; i++) {
        var ext = files[i].getName().substring(files[i].getName().lastIndexOf("."));
        var newName = baseName + "_" + (limit - i) + ext;
        files[i].setName(newName);
        updateSSFileName(sheet, files[i].getId(), newName);
      }
      replyMessage(replyToken, "✅ 直近 " + limit + " 件を一括リネームしました。");
    } else if (!isNaN(args[0]) && args.length > 1) {
      var index = parseInt(args[0]) - 1;
      var newNamePart = args.slice(1).join(" ");
      if (index < 0 || index >= files.length) throw new Error("該当番号なし。");
      var ext = files[index].getName().substring(files[index].getName().lastIndexOf("."));
      var finalName = newNamePart + ext;
      files[index].setName(finalName);
      updateSSFileName(sheet, files[index].getId(), finalName);
      replyMessage(replyToken, "✅ " + (index + 1) + "番目のファイルをリネームしました。");
    } else {
      var lastId = props.getProperty("LAST_FILE_ID_" + sourceId);
      if (!lastId) throw new Error("直前のファイルなし。");
      var file = DriveApp.getFileById(lastId);
      var ext = file.getName().substring(file.getName().lastIndexOf("."));
      var finalName = commandText + ext;
      file.setName(finalName);
      updateSSFileName(sheet, lastId, finalName);
      replyMessage(replyToken, "✅ リネーム完了: " + finalName);
    }
  } catch (e) { replyMessage(replyToken, "❌ リネームエラー: " + e.message); }
}

function updateSSFileName(sheet, fileId, newName) {
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][4] && data[i][4].indexOf(fileId) !== -1) {
      sheet.getRange(i + 1, 3).setValue(newName);
      break;
    }
  }
}

function handleMemoCommand(memoText, replyToken, sourceId, source) {
  if (!memoText.trim()) {
    replyMessage(replyToken, "💡 メモの内容を入力してください。\n例: /memo 海で撮った一枚");
    return;
  }
  try {
    var lastFileId = props.getProperty("LAST_FILE_ID_" + sourceId);
    if (!lastFileId) throw new Error("対象ファイルなし。");
    var ss = getOrCreateSpreadsheet(source, sourceId);
    var chatName = getBaseName(source);
    var sheet = ss.getSheetByName(chatName);
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (data[i][4] && data[i][4].indexOf(lastFileId) !== -1) {
        sheet.getRange(i + 1, 4).setValue(memoText);
        replyMessage(replyToken, "📝 メモを記録しました。");
        return;
      }
    }
    throw new Error("ログが見つかりません。");
  } catch (e) { replyMessage(replyToken, "❌ メモ失敗: " + e.message); }
}

function saveMediaToDrive(messageId, replyToken, msgType, source, originalName, sourceId, userName) {
  try {
    var response = UrlFetchApp.fetch("https://api-data.line.me/v2/bot/message/" + messageId + "/content", { "headers": { "Authorization": "Bearer " + CHANNEL_ACCESS_TOKEN }, "method": "get" });
    var blob = response.getBlob();
    var dateString = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyyMMdd");
    var groupFolder = getOrCreateGroupFolder(source, sourceId);
    var dateFolders = groupFolder.getFoldersByName(dateString);
    var targetFolder = dateFolders.hasNext() ? dateFolders.next() : groupFolder.createFolder(dateString);       
    var fileName = "";
    if (msgType === "file" && originalName) {
      fileName = originalName;
      var counter = 1;
      var nameWithoutExt = fileName.substring(0, fileName.lastIndexOf("."));
      var ext = fileName.substring(fileName.lastIndexOf("."));
      while (targetFolder.getFilesByName(fileName).hasNext()) { fileName = nameWithoutExt + "_" + counter + ext; counter++; }
    } else {
      var ext = (msgType === "video") ? ".mp4" : ".jpg";
      fileName = dateString + ext;
      var counter = 1;
      while (targetFolder.getFilesByName(fileName).hasNext()) { fileName = dateString + "_" + counter + ext; counter++; }
    }
    blob.setName(fileName);
    var file = targetFolder.createFile(blob);
    logToSpreadsheet(source, sourceId, userName, timestamp(), fileName, "", file.getUrl(), file.getId());       
    var replyMode = props.getProperty("REPLY_MODE_" + sourceId);
    if (source.type === "user" || replyMode === "on") sendFlexSavedMessage(replyToken, (msgType === "video" ? "動画" : (msgType === "image" ? "写真" : "ファイル")), fileName);
  } catch (e) { replyMessage(replyToken, "❌ 保存失敗: " + e.toString()); }
}

function logToSpreadsheet(source, sourceId, userName, time, fileName, memo, fileUrl, fileId) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    var ss = getOrCreateSpreadsheet(source, sourceId);
    var chatName = getBaseName(source);
    var sheet = ss.getSheetByName(chatName);
    if (!sheet) {
      sheet = ss.insertSheet(chatName);
      sheet.appendRow(["日時", "ユーザー名", "ファイル名", "内容/memo", "URL"]);
      sheet.setFrozenRows(1);
    }
    sheet.appendRow([time, userName, fileName, memo, fileUrl]);
    if (fileId) props.setProperty("LAST_FILE_ID_" + sourceId, fileId);
    SpreadsheetApp.flush();
  } catch (e) {
    var adminId = props.getProperty("MY_USER_ID");
    if (adminId) pushMessage(adminId, "🚨 LogToSpreadsheet Error: " + e.toString());
  } finally {
    lock.releaseLock();
  }
}

function getOrCreateSpreadsheet(source, sourceId) {
  var ssId = props.getProperty("SHARED_LOG_SS_ID");
  if (ssId) {
    try { return SpreadsheetApp.openById(ssId); } catch (e) {}
  }
  var ss = SpreadsheetApp.create("LINE_BOT_ALL_LOGS");
  props.setProperty("SHARED_LOG_SS_ID", ss.getId());
  try {
    var file = DriveApp.getFileById(ss.getId());
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) {}
  return ss;
}

function getOrCreateGroupFolder(source, sourceId) {
  var folderIdKey = "FOLDER_ID_" + sourceId;
  var cachedId = props.getProperty(folderIdKey);
  if (cachedId) { try { return DriveApp.getFolderById(cachedId); } catch (e) {} }
  var rootFolder = DriveApp.getFolderById(ROOT_FOLDER_ID);
  var groupName = getBaseName(source);
  var folders = rootFolder.getFoldersByName(groupName);
  var folder = folders.hasNext() ? folders.next() : rootFolder.createFolder(groupName);
  props.setProperty(folderIdKey, folder.getId());
  return folder;
}

function getBaseName(source) {
  var name = "User_" + (source.userId ? source.userId.substring(0, 8) : "Unknown");
  if (source.type === "group" && source.groupId) {
    try {
      var res = UrlFetchApp.fetch("https://api.line.me/v2/bot/group/" + source.groupId + "/summary", { "headers": { "Authorization": "Bearer " + CHANNEL_ACCESS_TOKEN }, "muteHttpExceptions": true });
      if (res.getResponseCode() === 200) name = JSON.parse(res.getContentText()).groupName;
      else name = "Group_" + source.groupId.substring(0, 8);
    } catch (e) { name = "Group_" + source.groupId.substring(0, 8); }
  } else if (source.type === "room" && source.roomId) {
    name = "Room_" + source.roomId.substring(0, 8);
  }
  return name.replace(/[\\\/\[\]\?\*]/g, "");
}

function sendFlexSavedMessage(replyToken, typeLabel, fileName) {
  var flexContent = {
    "type": "bubble",
    "body": { "type": "box", "layout": "vertical", "contents": [
      { "type": "text", "text": "✅ 保存しました(" + typeLabel + ")", "weight": "bold", "size": "lg", "color": "#00b900" },
      { "type": "box", "layout": "vertical", "margin": "lg", "spacing": "sm", "contents": [
        { "type": "box", "layout": "baseline", "spacing": "sm", "contents": [
          { "type": "text", "text": "File", "color": "#aaaaaa", "size": "sm", "flex": 1 },
          { "type": "text", "text": fileName, "wrap": true, "color": "#666666", "size": "sm", "flex": 4 }
        ] }
      ] }
    ] },
    "footer": { "type": "box", "layout": "vertical", "spacing": "sm", "contents": [
      { "type": "button", "style": "primary", "height": "sm", "color": "#00b900", "action": { "type": "postback", "label": "名前を変更", "data": "action=rename", "inputOption": "openKeyboard", "fillInText": "/rename " } },
      { "type": "box", "layout": "horizontal", "spacing": "sm", "contents": [
        { "type": "button", "style": "secondary", "height": "sm", "color": "#ff9f00", "action": { "type": "postback", "label": "メモを追記", "data": "action=memo", "inputOption": "openKeyboard", "fillInText": "/memo " } },
        { "type": "button", "style": "secondary", "height": "sm", "color": "#ff3b30", "action": { "type": "message", "label": "削除", "text": "/delete" } }
      ] },
      { "type": "button", "style": "link", "height": "sm", "action": { "type": "message", "label": "一覧を見る", "text": "/list" } }
    ] }
  };
  UrlFetchApp.fetch("https://api.line.me/v2/bot/message/reply", {
    "headers": { "Content-Type": "application/json", "Authorization": "Bearer " + CHANNEL_ACCESS_TOKEN },
    "method": "post",
    "payload": JSON.stringify({ "replyToken": replyToken, "messages": [{ "type": "flex", "altText": "✅ 保存完了: " + fileName, "contents": flexContent }] }),
    "muteHttpExceptions": true
  });
}

function replyMessage(replyToken, text) {
  UrlFetchApp.fetch("https://api.line.me/v2/bot/message/reply", { "headers": { "Content-Type": "application/json", "Authorization": "Bearer " + CHANNEL_ACCESS_TOKEN }, "method": "post", "payload": JSON.stringify({ "replyToken": replyToken, "messages": [{ "type": "text", "text": text }] }), "muteHttpExceptions": true });
}

function pushMessage(to, text) {
  UrlFetchApp.fetch("https://api.line.me/v2/bot/message/push", { "headers": { "Content-Type": "application/json", "Authorization": "Bearer " + CHANNEL_ACCESS_TOKEN }, "method": "post", "payload": JSON.stringify({ "to": to, "messages": [{ "type": "text", "text": text }] }), "muteHttpExceptions": true });
}

function sendHelp(replyToken) {
  replyMessage(replyToken, "🤖 [基本コマンド]\n・/commands : 詳細マニュアルを表示\n・/rename [名前] : 直前のファイル名を変更\n・/memo [内容] : ファイルにメモを追記\n・/list : 本日のファイル一覧を表示\n・/help : この一覧を表示");
}

function sendDetailedCommands(replyToken) {
  var msg = "📝 [ボット完全マニュアル]\n━━━━━━━━━━━━━━\n✨ リネーム (/rename)\n・/rename [名前] : 直前のファイルをリネーム\n・/rename [番号] [名前] : 指定番号のファイルをリネーム\n・/rename last [個数] [名前] : 直近N件を一括リネーム\n・/rename all [名前] : 本日の全ファイルを一括リネーム\n\n📝 メモ追記 (/memo)\n・/memo [内容] : 直前のファイルのログにメモを追記\n\n🗑️ 削除 (/delete)\n・直前のファイルをゴミ箱へ移動\n\n⚙️ 設定 (/reply)\n・/reply [on/off] : 通知の切替\n━━━━━━━━━━━━━━";
  replyMessage(replyToken, msg);
}

function handleDeleteCommand(replyToken, sourceId) {
  try {
    var lastId = props.getProperty("LAST_FILE_ID_" + sourceId);
    if (!lastId) throw new Error("対象なし。");
    var file = DriveApp.getFileById(lastId);
    file.setTrashed(true);
    replyMessage(replyToken, "🗑️ ファイルを削除しました。");
  } catch (e) { replyMessage(replyToken, "❌ 削除失敗: " + e.message); }
}

function handleReplyModeCommand(mode, replyToken, sourceId, source) {
  var status = (mode.toLowerCase() === "on") ? "on" : "off";
  props.setProperty("REPLY_MODE_" + sourceId, status);
  replyMessage(replyToken, "⚙️ 自動応答: " + status.toUpperCase());
}

function sendList(replyToken, source, sourceId) {
  try {
    var dateString = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyyMMdd");
    var groupFolder = getOrCreateGroupFolder(source, sourceId);
    var folders = groupFolder.getFoldersByName(dateString);
    var fileList = [];
    if (folders.hasNext()) {
      var files = folders.next().getFiles();
      while (files.hasNext()) { fileList.push("- " + files.next().getName()); }
    }
    replyMessage(replyToken, "📂 本日のファイル:\n" + (fileList.length > 0 ? fileList.join("\n") : "なし"));    
  } catch (e) { replyMessage(replyToken, "❌ リスト取得失敗"); }
}

function getUserName(sourceId, userId, sourceType) {
  try {
    var url = (sourceType === "group") ? "https://api.line.me/v2/bot/group/" + sourceId + "/member/" + userId : 
              (sourceType === "room") ? "https://api.line.me/v2/bot/room/" + sourceId + "/member/" + userId :   
              "https://api.line.me/v2/bot/profile/" + userId;
    var res = UrlFetchApp.fetch(url, { "headers": { "Authorization": "Bearer " + CHANNEL_ACCESS_TOKEN }, "muteHttpExceptions": true });
    if (res.getResponseCode() === 200) return JSON.parse(res.getContentText()).displayName;
  } catch (e) {}
  return "Unknown User";
}

function handleLinkCommand(replyToken, source, sourceId) {
  try {
    var folder = getOrCreateGroupFolder(source, sourceId);
    var ss = getOrCreateSpreadsheet(source, sourceId);
    replyMessage(replyToken, "🔗 リンク案内\n📁 フォルダ: " + folder.getUrl() + "\n📊 ログSS: " + ss.getUrl());
  } catch (e) { replyMessage(replyToken, "❌ リンク取得失敗"); }
}
