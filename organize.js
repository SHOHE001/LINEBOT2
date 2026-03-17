/**
 * Googleドライブ内のファイルを精査し、自動的にフォルダ分けを行います。
 * ※ファイルの削除は一切行いません。
 */
function runDriveOrganization() {
  var root = DriveApp.getRootFolder();
  var files = root.getFiles();
  
  // フォルダ取得・作成ヘルパー
  var getFolder = function(parent, name) {
    var folders = parent.getFoldersByName(name);
    return folders.hasNext() ? folders.next() : parent.createFolder(name);
  };

  Logger.log("整理を開始します...");

  while (files.hasNext()) {
    var file = files.next();
    var name = file.getName();
    var dest = null;

    // 1. 就活関連
    if (name.match(/27新卒|履歴書|エントリーシート|ES|会社説明会|jobdescription/i)) {
      dest = getFolder(root, "就活");
    }
    // 2. 講義関連
    else if (name.match(/講義スライド|第.*回|レポート|地方財政論|問題解決法|自治体/)) {
      dest = getFolder(root, "講義");
    }
    // 3. 議事録 (GMT)
    else if (name.match(/GMT|Recording/)) {
      dest = getFolder(root, "議事録");
    }
    // 4. アプリケーション (インストーラー)
    else if (name.match(/\.exe$|\.msi$/i)) {
      dest = getFolder(root, "アプリケーション");
    }
    // 5. もの文関連 (階層構造あり)
    else if (name.match(/春キャン|備品リスト|年始発表会|monoweb|もの文|web調査票/)) {
      var monobun = getFolder(root, "もの文");
      
      if (name.indexOf("春キャン") !== -1) {
        dest = getFolder(monobun, "春キャン2026");
      } else if (name.indexOf("2025") !== -1 && name.indexOf("年始") !== -1) {
        dest = getFolder(monobun, "年始発表会2025");
      } else if (name.indexOf("2026") !== -1 && name.indexOf("年始") !== -1) {
        dest = getFolder(monobun, "年始発表会2026");
      } else if (name.match(/monoweb|group|web調査票/i)) {
        dest = getFolder(monobun, "もの文web");
      } else {
        dest = monobun;
      }
    }

    // 移動の実行
    if (dest) {
      try {
        file.moveTo(dest);
        Logger.log("Moved: " + name + " -> " + dest.getName());
      } catch (e) {
        Logger.log("Error moving " + name + ": " + e.toString());
      }
    }
  }
  Logger.log("整理が完了しました。");
}
