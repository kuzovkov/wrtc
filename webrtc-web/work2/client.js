var PeerConnection = window.mozRTCPeerConnection || window.webkitRTCPeerConnection;
var IceCandidate = window.mozRTCIceCandidate || window.RTCIceCandidate;
var SessionDescription = window.mozRTCSessionDescription || window.RTCSessionDescription;
navigator.getUserMedia = navigator.getUserMedia || navigator.mozGetUserMedia || navigator.webkitGetUserMedia;

////////////////////////////////////////////
// AudioAPI
var audioCtx;
var audioSource = null;
try {
    // Fix up for prefixing
    window.AudioContext = window.AudioContext||window.webkitAudioContext;
    audioCtx = new AudioContext();
}
catch(e) {
    console.log('Web Audio API is not supported in this browser');
}

var call_sound = null; /*буфер для звука вызова*/
/*загружаем звук с сервера*/
loadSound('/sounds/call.mp3', function(buffer){ call_sound = buffer; });

/////////////////////////////////////////////////////////////

var pc = null; // PeerConnection
var localStream = null;
//var pc_config = {"iceServers": [{"url": "turn:drakmail%40delta.pm@numb.viagenie.ca:3478", "credential": "PLACE_HERE_YOUR_PASSWORD"}, {"url": "stun:stun.l.google.com:19302"}]};
var pc_config = null;
var online = false;
var hang_up = true; /*повешена ли трубка*/
var mediaOptions = { audio: true, video: true };

if (!Date.now) {
    Date.now = function now() {
        return new Date().getTime();
    };
}

/**
 * инициация вызова вызывающим абонентом,
 * отправка вызываемому абоненту приглашения к связи
 */
function call(){
    console.log(Date.now(), 'call');
    hang_up = false;
    sendMessage({type:'intent_call'});
    playSound(call_sound);
    document.getElementById("hangupButton").style.display = 'inline-block';
}

/**
 * начало звонка при получении согласия вызываемого абонента
 */
function beginConnect(){
    if (!hang_up) getUserMedia(gotStreamCaller);
}

/**
 * получение медиапотоков с камеры и микрофона
 * @param callback функция обратного вызова в которую передается stream
 */
function getUserMedia(callback){
    console.log(Date.now(), 'getUserMedia');
    navigator.getUserMedia(
        mediaOptions,
        callback,
        function(error) { console.log(error) }
    );
}

/**
 * инициация ответа вызывающему абоненту
 */
function answer(){
    console.log(Date.now(), 'answer');
    getUserMedia(gotStreamCalle);
}

/**
 * обработчик получения медиапотока вызывающим абонентом
 * @param stream медиапоток
 */
function gotStreamCaller(stream) {
    sendMessage({type:'call'});
    attachStream(document.getElementById("localVideo"), stream);
    localStream = stream;
    console.log(Date.now(), 'gotStream:', stream);
    pc = new PeerConnection(pc_config);
    pc.addStream(stream);
    pc.onicecandidate = gotIceCandidate;
    pc.onaddstream = gotRemoteStream;
}

/**
 * присоединение потока к объекту video для проигрывания
 * @param el елемент DOM video
 * @param stream медиапоток
 */
function attachStream(el, stream) {
    var myURL = window.URL || window.webkitURL;
    if (!myURL) {
        el.src = stream;
    } else {
        el.src = myURL.createObjectURL(stream);
    }
}

/**
 * обработчик получения медиапотока вызываемым абонентом (в соотв. с протоколом WebRTC)
 * @param stream медиапоток
 */
function gotStreamCalle(stream) {
    attachStream(document.getElementById("localVideo"), stream);
    localStream = stream;
    pc = new PeerConnection(pc_config);
    pc.addStream(stream);
    pc.onicecandidate = gotIceCandidate;
    pc.onaddstream = gotRemoteStream;
    sendMessage({type:'offer_ready'});
}


/**
 * создание Offer для инициации связи (в соотв. с протоколом WebRTC)
 */
function createOffer() {
    console.log(Date.now(), 'createOffer');
    document.getElementById("hangupButton").style.display = 'inline-block';
    pc.createOffer(
        gotLocalDescription,
        function(error) { console.log(error) },
        { 'mandatory': { 'OfferToReceiveAudio': true, 'OfferToReceiveVideo': true } }
    );
}


/**
 * создание Answer для инициации связи (в соотв. с протоколом WebRTC)
 */
function createAnswer() {
    console.log(Date.now(), 'createAnswer');
    pc.createAnswer(
        gotLocalDescription,
        function(error) { console.log(error) },
        { 'mandatory': { 'OfferToReceiveAudio': true, 'OfferToReceiveVideo': true } }
    );
}

/**
 * обработчик получения локального SDP (в соотв. с протоколом WebRTC)
 * @param description SDP
 */
function gotLocalDescription(description){
    console.log(Date.now(), 'gotLocalDescription:', description);
    pc.setLocalDescription(description);
    sendMessage(description);
}

/**
 * обработчик получения ICE Candidate объектом RTCPeerConnection (в соотв. с протоколом WebRTC)
 * @param event
 */
function gotIceCandidate(event){
    console.log(Date.now(), 'gotIceCandidate: ', event.candidate);
    if (event.candidate) {
        sendMessage({
            type: 'candidate',
            label: event.candidate.sdpMLineIndex,
            id: event.candidate.sdpMid,
            candidate: event.candidate.candidate
        });
    }
}

/**
 * обработчик получения объектом RTCPeerConnection
 * удаленного медиапотока
 * @param event объект события
 */
function gotRemoteStream(event){
    console.log(Date.now(), 'gotRemoteStream: ', event.stream);
    document.getElementById("hangupButton").style.display = 'inline-block';
    attachStream(document.getElementById("remoteVideo"), event.stream);
    online = true;
    stopSound();
}


////////////////////////////////////////////////
// Socket.io

var socket = io.connect('', {port: 1234});

/**
 * отправка сообщений абоненту через socket.io
 * для обеспечения сигналлинга
 * @param message
 */
function sendMessage(message){
    console.log(Date.now(), 'send_message: ', message);
    socket.emit('message', message);
}

/**
 * обработка сообщений от абонента
 * для обеспечения сигналлинга
 */
socket.on('message', function (message){
    console.log(Date.now(), 'recive_message: ', message);
    if (pc == null)console.log('pc == null');
    if (pc != null && message.type === 'offer') {
        pc.setRemoteDescription(new SessionDescription(message));
        createAnswer();
    }
    else if (pc != null && message.type === 'answer') {
        pc.setRemoteDescription(new SessionDescription(message));
    }
    else if (pc != null && message.type === 'candidate') {
        //var candidate = new IceCandidate({sdpMLineIndex: message.label, candidate: message.candidate});
        try{
            var candidate = new IceCandidate(message);
            pc.addIceCandidate(candidate);
        }catch (e){
            console.log(e);
        }

    }else if (message.type === 'hangup'){
        disconnect();
    }else if(message.type === 'call'){
        answer();
    }else if(message.type === 'offer_ready'){
        createOffer();
    }else if (message.type === 'intent_call'){
        playSound(call_sound);
        if (confirmAnswer()){
            sendMessage({type:'ready_call'});
        }else{
            sendMessage({type:'reject_call'});
            stopSound();
        }
    }else if (message.type === 'ready_call'){
        beginConnect();
    }else if (message.type === 'reject_call'){
        document.getElementById("hangupButton").style.display = 'none';
        stopSound();
        alert('Вызов отклонен');
    }

});

/**
 * завершение сеанса связи
 */
function hangup(){
    sendMessage({type:'hangup'});
    disconnect();
}


/**
 * завершение сеанса связи
 */
function disconnect(){
    hang_up = true;
    if (online){
        online = false;
    }
    if(pc != null){
        pc.close();
        pc = null;
    }
    if (localStream != null){

        localStream.getVideoTracks().forEach(function (track) {
            track.stop();
        });

        localStream.getAudioTracks().forEach(function (track) {
            track.stop();
        });
        localStream == null;
    }
    document.getElementById("callButton").style.display = 'inline-block';
    document.getElementById("hangupButton").style.display = 'none';
    document.getElementById("localVideo").src = '';
    document.getElementById("remoteVideo").src = '';
    stopSound();
}

/**
 * Принятие или отклонение звонка
 */
function confirmAnswer(){
    return confirm('Принять звонок?');
};


/**
 * загрузка звукового файла с сервера и формирование из него буфера
 * @param url URL файла
 * @param buffer буфер в который помещается результат
 */
function loadSound(url, callback) {
    var request = new XMLHttpRequest();
    request.open('GET', url, true);
    request.responseType = 'arraybuffer';

    // Decode asynchronously
    request.onload = function() {
        audioCtx.decodeAudioData(request.response, function(buffer) {
                callback(buffer);
            }, function(err){console.log(err);});
    };
    request.send();
}

/**
 * проигрывание звука
 * @param buffer
 */
function playSound(buffer) {
    audioSource = audioCtx.createBufferSource();    // creates a sound audioSource
    audioSource.buffer = buffer;                    // tell the audioSource which sound to play
    audioSource.loop = true;
    audioSource.connect(audioCtx.destination);      // connect the audioSource to the context's destination (the speakers)
    audioSource.start(0);                           // play the audioSource now// note: on older systems, may have to use deprecated noteOn(time);
}

/**
 * останов проигывания звука
 */
function stopSound(){
    if (audioSource != null){
        audioSource.stop(0);
        audioSource = null;
    }

}


