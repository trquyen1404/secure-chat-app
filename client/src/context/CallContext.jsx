import React, { createContext, useContext, useState, useRef, useEffect } from 'react';
import { useSocket } from './SocketContext';
import { useAuth } from './AuthContext';
import { Phone, Video, PhoneCall, X, Lock, Loader2 } from 'lucide-react';

const CallContext = createContext({});

export const useCall = () => useContext(CallContext);

export const CallProvider = ({ children }) => {
  const { socket } = useSocket();
  const { user } = useAuth();
  
  const [stream, setStream] = useState(null);
  const [receivingCall, setReceivingCall] = useState(false);
  const [caller, setCaller] = useState("");
  const [callerSignal, setCallerSignal] = useState(null);
  const [callAccepted, setCallAccepted] = useState(false);
  const [callEnded, setCallEnded] = useState(false);
  const [isVideoCall, setIsVideoCall] = useState(false);
  const [activeCallUser, setActiveCallUser] = useState(null);

  const myVideo = useRef();
  const userVideo = useRef();
  const connectionRef = useRef();

  // Socket handlers
  useEffect(() => {
    if (!socket) return;
    
    socket.on("incomingCall", (data) => {
      setReceivingCall(true);
      setCaller(data.from);
      setCallerSignal(data.signal);
      setIsVideoCall(data.isVideo);
      setActiveCallUser(data.from);
    });

    return () => {
      socket.off("incomingCall");
    };
  }, [socket]);

  // Clean-up function
  const cleanupCall = () => {
    setReceivingCall(false);
    setCallAccepted(false);
    setActiveCallUser(null);
    setCaller("");
    setCallerSignal(null);
    
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    setStream(null);
    
    if (connectionRef.current) {
      connectionRef.current.close();
      connectionRef.current = null;
    }
    if (socket) {
        socket.off("callAccepted");
        socket.off("iceCandidate");
        socket.off("callEnded");
        socket.off("callRejected");
    }
  };

  const createPeer = (isInitiator) => {
    const peer = new RTCPeerConnection({
       iceServers: [
         { urls: 'stun:stun.l.google.com:19302' },
         { urls: 'stun:global.stun.twilio.com:3478' }
       ]
    });
    
    peer.onicecandidate = (event) => {
      if (event.candidate && socket && activeCallUser) {
         socket.emit('iceCandidate', { to: activeCallUser, candidate: event.candidate });
      }
    };
    
    peer.ontrack = (event) => {
       if (userVideo.current) {
         userVideo.current.srcObject = event.streams[0];
       }
    };
    
    return peer;
  };

  const callUser = async (id, isVideo = false) => {
     try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({ video: isVideo, audio: true });
        setStream(mediaStream);
        setIsVideoCall(isVideo);
        setActiveCallUser(id);
        setCallEnded(false);
        setReceivingCall(false);
        setCallAccepted(false);

        const peer = createPeer(true);
        mediaStream.getTracks().forEach((track) => peer.addTrack(track, mediaStream));
        connectionRef.current = peer;
        
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        
        socket.emit("callUser", {
          userToCall: id,
          signal: offer,
          isVideo: isVideo,
        });
        
        // Listeners for outgoing call
        socket.on("callAccepted", async (signal) => {
           setCallAccepted(true);
           try {
             await peer.setRemoteDescription(new RTCSessionDescription(signal));
           } catch(e) { console.error('SetRemote error', e); }
        });
        
        socket.on("iceCandidate", async (candidate) => {
           try {
             await peer.addIceCandidate(new RTCIceCandidate(candidate));
           } catch(e) {}
        });

        socket.on("callRejected", () => {
           alert("Người dùng đã từ chối cuộc gọi");
           cleanupCall();
           setCallEnded(true);
        });

        socket.on("callEnded", () => {
           cleanupCall();
           setCallEnded(true);
        });

     } catch(err) {
        console.error("Lỗi Microphone/Camera", err);
        alert("Không thể truy cập Microphone/Camera! Hãy cấp quyền trình duyệt.");
     }
  };

  const answerCall = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: isVideoCall, audio: true });
      setStream(mediaStream);
      setCallAccepted(true);
      setCallEnded(false);
      
      const peer = createPeer(false);
      mediaStream.getTracks().forEach((track) => peer.addTrack(track, mediaStream));
      connectionRef.current = peer;
      
      await peer.setRemoteDescription(new RTCSessionDescription(callerSignal));
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      
      socket.emit("answerCall", { signal: answer, to: caller });
      
      // Listeners for incoming call
      socket.on("iceCandidate", async (candidate) => {
         try {
           await peer.addIceCandidate(new RTCIceCandidate(candidate));
         } catch(e) {}
      });

      socket.on("callEnded", () => {
         cleanupCall();
         setCallEnded(true);
      });

    } catch (err) {
       console.error("Lỗi Microphone/Camera", err);
       alert("Không thể truy cập Microphone/Camera");
       rejectCall();
    }
  };

  const rejectCall = () => {
    if (socket && caller) {
       socket.emit("rejectCall", { to: caller });
    }
    cleanupCall();
  };

  const leaveCall = () => {
    if (socket && activeCallUser) {
        socket.emit("endCall", { to: activeCallUser });
    }
    cleanupCall();
    setCallEnded(true);
  };

  // Bind local video stream when it renders
  useEffect(() => {
     if (myVideo.current && stream) {
        myVideo.current.srcObject = stream;
     }
  }, [stream, callAccepted, receivingCall, isVideoCall]);

  const isActiveCall = (callAccepted && !callEnded) || (!receivingCall && activeCallUser && !callAccepted && !callEnded);
  const isDialing = !receivingCall && activeCallUser && !callAccepted && !callEnded;

  return (
    <CallContext.Provider value={{ callUser, answerCall, leaveCall, rejectCall }}>
      {children}
      
      {/* INCOMING CALL MODAL */}
      {(receivingCall && !callAccepted) && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
           <div className="bg-slate-900 border border-indigo-500/30 p-8 rounded-2xl flex flex-col items-center shadow-2xl shadow-indigo-500/20 w-full max-w-sm">
              <div className="w-20 h-20 bg-indigo-600 rounded-full flex items-center justify-center mb-6 animate-pulse">
                 {isVideoCall ? <Video className="w-10 h-10 text-white" /> : <PhoneCall className="w-10 h-10 text-white" />}
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Cuộc gọi đến từ mã: {caller.substring(0,8)}...</h2>
              <p className="text-indigo-400 font-medium mb-8 flex items-center gap-1">
                 <Lock className="w-4 h-4" /> Bảo mật WebRTC P2P
              </p>
              
              <div className="flex gap-6 w-full">
                 <button onClick={rejectCall} className="flex-1 py-3 bg-red-500 hover:bg-red-600 rounded-full font-bold text-white shadow-lg shadow-red-500/20">Từ chối</button>
                 <button onClick={answerCall} className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-600 rounded-full font-bold text-white shadow-lg shadow-emerald-500/20">Nghe</button>
              </div>
           </div>
        </div>
      )}

      {/* ACTIVE CALL OR DIALING OVERLAY */}
      {isActiveCall && (
        <div className="fixed inset-0 z-[60] bg-slate-950 flex flex-col">
           {isDialing && (
               <div className="absolute top-10 w-full text-center z-10">
                   <h3 className="text-white text-2xl font-semibold mb-2">Đang thiết lập kết nối mã hóa...</h3>
                   <p className="text-indigo-400 flex justify-center gap-2 items-center"><Loader2 className="w-5 h-5 animate-spin" /> Đợi đối tác nhấc máy (Ring Ring...)</p>
               </div>
           )}

           <div className="flex-1 relative flex items-center justify-center p-4">
              {/* Remote Video / Audio Placeholder */}
              {isVideoCall ? (
                 <video playsInline ref={userVideo} autoPlay className="w-full h-full max-h-screen object-cover sm:object-contain rounded-xl" />
              ) : (
                 <div className="w-32 h-32 bg-indigo-600/20 rounded-full flex items-center justify-center border-4 border-indigo-500/30">
                    <Phone className="w-12 h-12 text-indigo-400 animate-pulse" />
                 </div>
              )}
              
              {/* Local Video */}
              {isVideoCall && (
                 <div className="absolute top-6 right-6 w-32 h-44 bg-black rounded-lg overflow-hidden border-2 border-slate-700 shadow-2xl z-20">
                    <video playsInline muted ref={myVideo} autoPlay className="w-full h-full object-cover" />
                 </div>
              )}
              
              {/* Only local audio stream attached manually to keep mic active */}
              {!isVideoCall && <audio playsInline muted ref={myVideo} autoPlay className="hidden" />}
              {!isVideoCall && <audio playsInline ref={userVideo} autoPlay className="hidden" />}
           </div>
           
           {/* Actions */}
           <div className="h-28 bg-slate-900 border-t border-slate-800 flex items-center justify-center gap-8 pb-4">
              <button 
                 onClick={leaveCall} 
                 className="w-16 h-16 bg-red-600 rounded-full flex items-center justify-center hover:bg-red-500 shadow-lg shadow-red-600/20 transition-transform hover:scale-105"
                 title="Dập máy"
              >
                 <Phone className="w-7 h-7 text-white rotate-[135deg]" />
              </button>
           </div>
        </div>
      )}
    </CallContext.Provider>
  );
};
