var link = '<' + useProperty('googleFormURL') + '|フォームへの回答はこちらから>' 

function useProperty(key){//スクリプトプロパティ使用の省略
  return PropertiesService.getScriptProperties().getProperty(key);
}


function SendtoSlack(message) {//Slachチャンネルに送信
  var postUrl = useProperty('debug_channel'); //debug用
  //var postUrl = useProperty('main_channel'); //普段はこっち
  var username = 'SORACOMbot';
  var icon = ':soracom:';

  var jsonData ={
     "username" : username,
     "icon_emoji": icon,
     "text" : message
  };
  var payload = JSON.stringify(jsonData);
  var options ={
    "method" : "post",
    "contentType" : "application/json",
    "payload" : payload
  };
  UrlFetchApp.fetch(postUrl, options);
}


function getToken(access_key_id, secret_access_key) {
  var data = {
     authKeyId: access_key_id,
     authKey: secret_access_key,
     tokenTimeoutSeconds: 30,
   };
  var option = {
   method : "post", //メソッドの指定
   payload: JSON.stringify(data), //body情報
   contentType: "application/json",
   muteHttpExceptions: true
 };
 
  var req = UrlFetchApp.fetch("https://api.soracom.io/v1/auth", option);
  var info = JSON.parse(req.getContentText()); //.getContentTextでレスポンステキストを取得
  var apiKey = info.apiKey;
  var token = info.token;
  var errMsg = info.message;
  return [apiKey, token, errMsg];
} 


function port_mapping(key, token, port, ip , time){
  var headers = {
    "Accept": "application/json",
    "X-Soracom-API-Key": key,
    "X-Soracom-Token": token
   };
  var data = { 
   "destination": {
     "imsi": useProperty('soracom_imsi'),
     "port": parseInt(port, 10),
   },
    "duration" : time,
    "source": {
     "ipRanges": [ip]
   },
   "tlsRequired": false
   }
  var option = {
    method : "post", 
    headers : headers,
    payload: JSON.stringify(data), 
    contentType: "application/json",
    muteHttpExceptions: true
  };
  
  var req = UrlFetchApp.fetch("https://api.soracom.io/v1/port_mappings", option);
  var info = JSON.parse(req.getContentText());
  var ipAddress = info.ipAddress;
  var port = info.port;
  var hostname = info.hostname;
  var errMsg = info.message; 
  return [ipAddress, port, hostname, errMsg];
}


function getBill(key, token){//請求額の取得
 var headers = {
   "Accept": "application/json",
   "X-Soracom-API-Key": key,
   "X-Soracom-Token": token
  }
 var option = {
   method : "get",
   headers : headers,
   muteHttpExceptions: true
 }
 
 var req = UrlFetchApp.fetch("https://api.soracom.io/v1/bills/latest", option);
 var info = JSON.parse(req.getContentText());
 var amount = info.amount;
 var errMsg = info.message;
 return  [amount, errMsg];
}


function getForm(e){//googleフォームの回答内容の取得
 var itemResponse = e.response.getItemResponses();
 for (var j = 0; j < itemResponse.length; j++){    
  var formData = itemResponse[j];
  var title = formData.getItem().getTitle();
  var response = formData.getResponse();

  switch (title) {
    case "開けるポート番号":
      var open_port = response;
      break;
    case "ポートの使用期間(最大8時間)":
      var time = response;
      var time_cal = time.split(':'); //時間の秒換算
      var open_time = Number(time_cal[0])*3600 + Number(time_cal[1])*60;
      break;
    case "追加アクセス元IPアドレスの範囲をCIDR形式（例：12.34.56.78/30）で入力してください":
      var ip_range = response;
      if(ip_range == ""){//IPアドレスレンジが未記入の際は所定のIPを使用
        var ip_range = useProperty('university_IP'); 
      }
      break;
   }
 }
 return [open_port, time, open_time, ip_range];
}


function main(e) {
  var keyId = useProperty('soracom_key');
  var secretKey = useProperty('soracom_secret_key');
  var [open_port, time, open_time, ip_range] = getForm(e);
  
  //APIキーとトークンの取得
  var [apiKey, token, errMsg] = getToken(keyId, secretKey);
  if(typeof apiKey == "undefined"){//getTokenエラー処理
   var message = "```エラーAPI: auth\n" + "エラー内容: " + errMsg + "\n" + link + "```";
   SendtoSlack(message);
   return;
  }
  
  //IPアドレスとポートの取得（オンデマンドリモートアクセス）
  var [ipAddress, port, hostname, errMsg] = port_mapping(apiKey, token, open_port, ip_range, open_time);
  if(typeof ipAddress == "undefined"){//port_mappingエラー処理
   var message = "```エラーAPI: CreatePortMapping\n" + "エラー内容: " + errMsg + "\n" + link + "```";
   SendtoSlack(message);
   return;
  }
  
  //請求額の取得
  var [amount, errMsg] = getBill(apiKey, token);
  if(typeof amount == "undefined"){//getBillエラー処理
    var message = "```エラーAPI: GetLatestBill\n" + "エラー内容: " + errMsg + "\n" + link + "```";
    SendtoSlack(message);
    return;
  }
  
  //slackに通知
  var body =  "*回答が来ました*\n" + "```■回答内容" + "\n開けるポート番号: " + open_port + "\nポートの使用期間(最大8時間): " + time + "\n追加アクセス元IPアドレス: " + ip_range + "\n\n■接続先" + "\nホスト: " + hostname  + "\nIPアドレス: " + ipAddress + "\nポート: " + port + "\n\n■現在の請求額 : ¥" + amount  + "\n\n" + link + "```";
  SendtoSlack(body);
}
