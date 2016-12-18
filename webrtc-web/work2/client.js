var PeerConnection = window.mozRTCPeerConnection || window.webkitRTCPeerConnection;
var IceCandidate = window.mozRTCIceCandidate || window.RTCIceCandidate;
var SessionDescription = window.mozRTCSessionDescription || window.RTCSessionDescription;
navigator.getUserMedia = navigator.getUserMedia || navigator.mozGetUserMedia || navigator.webkitGetUserMedia;

var pc = null; // PeerConnection
var localStream = null;
//var pc_config = {"iceServers": [{"url": "turn:drakmail%40delta.pm@numb.viagenie.ca:3478", "credential": "PLACE_HERE_YOUR_PASSWORD"}, {"url": "stun:stun.l.google.com:19302"}]};
var pc_config = null;
var online = false;
var mediaOptions = { audio: true, video: true };

if (!Date.now) {
    Date.now = function now() {
        return new Date().getTime();
    };
}


function call(){
    console.log(Date.now(), 'call');
    sendMessage({type:'intent_call'});
}


function beginConnect(){
    getUserMedia(gotStreamCaller);
}

function getUserMedia(callback){
    console.log(Date.now(), 'getUserMedia');
    navigator.getUserMedia(
        mediaOptions,
        callback,
        function(error) { console.log(error) }
    );
}


function answer(){
    console.log(Date.now(), 'answer');
    getUserMedia(gotStreamCalle);
}


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

function attachStream(el, stream) {
    var myURL = window.URL || window.webkitURL;
    if (!myURL) {
        el.src = stream;
    } else {
        el.src = myURL.createObjectURL(stream);
    }
}

function gotStreamCalle(stream) {
    attachStream(document.getElementById("localVideo"), stream);
    localStream = stream;
    pc = new PeerConnection(pc_config);
    pc.addStream(stream);
    pc.onicecandidate = gotIceCandidate;
    pc.onaddstream = gotRemoteStream;
    sendMessage({type:'offer_ready'});
}


// Step 2. createOffer
function createOffer() {
    console.log(Date.now(), 'createOffer');
    document.getElementById("hangupButton").style.display = 'inline-block';
    pc.createOffer(
        gotLocalDescription,
        function(error) { console.log(error) },
        { 'mandatory': { 'OfferToReceiveAudio': true, 'OfferToReceiveVideo': true } }
    );
}


// Step 3. createAnswer
function createAnswer() {
    console.log(Date.now(), 'createAnswer');
    pc.createAnswer(
        gotLocalDescription,
        function(error) { console.log(error) },
        { 'mandatory': { 'OfferToReceiveAudio': true, 'OfferToReceiveVideo': true } }
    );
}


function gotLocalDescription(description){
    console.log(Date.now(), 'gotLocalDescription:', description);
    pc.setLocalDescription(description);
    sendMessage(description);
}

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

function gotRemoteStream(event){
    console.log(Date.now(), 'gotRemoteStream: ', event.stream);
    document.getElementById("hangupButton").style.display = 'inline-block';
    attachStream(document.getElementById("remoteVideo"), event.stream);
    online = true;
}


////////////////////////////////////////////////
// Socket.io

var socket = io.connect('', {port: 1234});

function sendMessage(message){
    console.log(Date.now(), 'send_message: ', message);
    socket.emit('message', message);
}

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
        hangup();
    }else if(message.type === 'call'){
        answer();
    }else if(message.type === 'offer_ready'){
        createOffer();
    }else if (message.type === 'intent_call'){
        if (confirmAnswer()){
            sendMessage({type:'ready_call'});
        }else{
            sendMessage({type:'reject_call'});
        }
    }else if (message.type === 'ready_call'){
        beginConnect();
    }else if (message.type === 'reject_call'){
        alert('Вызов отклонен');
    }


});

function hangup(){
    if (online){
        online = false;
        pc.close();
        pc = null;
        sendMessage({type:'hangup'});
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

}

function confirmAnswer(){
    return confirm('Принять звонок?');
};



