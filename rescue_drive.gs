function doGet() {
  var result = rescueAndOrganize();
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

function rescueAndOrganize() {
  var files = DriveApp.getTrashedFiles();
  var rescued = [];
  
  // 移動先のフォルダ(02_202511_詳細検討・長時間会議)を特定
  var folders = DriveApp.getFoldersByName('02_202511_詳細検討・長時間会議');
  var targetFolder = folders.hasNext() ? folders.next() : DriveApp.createFolder('02_202511_詳細検討・長時間会議');
  
  while (files.hasNext()) {
    var file = files.next();
    var name = file.getName();
    
    if (name.match(/GMT|Recording|20251116/i)) {
      if (file.getMimeType() !== MimeType.GOOGLE_FOLDER) {
        file.setTrashed(false); // 救出！
        
        // 救出したファイルを目的のフォルダに移動
        file.moveTo(targetFolder);
        
        // 分かりやすい名前にリネーム
        var newName = name.replace(/GMT(\d{8})-(\d{6})_Recording/g, '')
                          .replace(/\.cutfile.*/, '_編集済');
        file.setName(newName);
        
        rescued.push(newName);
      }
    }
  }
  return { status: 'success', total: rescued.length, files: rescued };
}
