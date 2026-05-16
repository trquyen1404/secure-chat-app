import React, { createContext, useContext, useState, useRef, useEffect } from 'react';
import { useSocket } from './SocketContext';
import { useAuth } from './AuthContext';
import { Phone, Video, PhoneCall, X, Lock, Loader2 } from 'lucide-react';
import api from '../utils/axiosConfig';

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
  const [isMinimized, setIsMinimized] = useState(false);
  const [callerName, setCallerName] = useState("");
  const myVideo = useRef();
  const userVideo = useRef();
  const connectionRef = useRef();

  useEffect(() => {
    if (!socket) return;
    socket.on("incomingCall", async (data) => {
      setReceivingCall(true);
      setCaller(data.from);
      setCallerSignal(data.signal);
      setIsVideoCall(data.isVideo);
      setActiveCallUser(data.from);
      try {
        const res = await api.get(`/api/users/${data.from}`);
        setCallerName(res.data.displayName || res.data.username);
      } catch (e) {
        setCallerName("Người dùng ẩn danh");
      }
    });
    return () => socket.off("incomingCall");
  }, [socket]);

  const cleanupCall = () => {
    setReceivingCall(false);
    setCallAccepted(false);
    setActiveCallUser(null);
    setCaller("");
    setCallerSignal(null);
    setIsMinimized(false);
    setCallerName("");
    if (stream) stream.getTracks().forEach(track => track.stop());
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

  const createPeer = () => {
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
       if (userVideo.current) userVideo.current.srcObject = event.streams[0];
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
        const peer = createPeer();
        mediaStream.getTracks().forEach((track) => peer.addTrack(track, mediaStream));
        connectionRef.current = peer;
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        socket.emit("callUser", { userToCall: id, signal: offer, isVideo: isVideo });
        socket.on("callAccepted", async (signal) => {
           setCallAccepted(true);
           try {
             await peer.setRemoteDescription(new RTCSessionDescription(signal));
           } catch(e) {}
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
        alert("Không thể truy cập Microphone/Camera! Hãy cấp quyền trình duyệt.");
     }
  };

  const answerCall = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: isVideoCall, audio: true });
      setStream(mediaStream);
      setCallAccepted(true);
      setCallEnded(false);
      const peer = createPeer();
      mediaStream.getTracks().forEach((track) => peer.addTrack(track, mediaStream));
      connectionRef.current = peer;
      await peer.setRemoteDescription(new RTCSessionDescription(callerSignal));
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      socket.emit("answerCall", { signal: answer, to: caller });
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
       alert("Không thể truy cập Microphone/Camera");
       rejectCall();
    }
  };

  const rejectCall = () => {
    if (socket && caller) socket.emit("rejectCall", { to: caller });
    cleanupCall();
  };

  const leaveCall = () => {
    if (socket && activeCallUser) socket.emit("endCall", { to: activeCallUser });
    cleanupCall();
    setCallEnded(true);
  };

  useEffect(() => {
     if (myVideo.current && stream) myVideo.current.srcObject = stream;
  }, [stream, callAccepted, receivingCall, isVideoCall]);

  const isActiveCall = (callAccepted && !callEnded) || (!receivingCall && activeCallUser && !callAccepted && !callEnded);
  const isDialing = !receivingCall && activeCallUser && !callAccepted && !callEnded;

  return (
    <CallContext.Provider value={{ callUser, answerCall, leaveCall, rejectCall, isMinimized, setIsMinimized, activeCallUser, callerName }}>
      {children}
      
      {/* --- Incoming Call Modal --- */}
      {(receivingCall && !callAccepted) && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-xl animate-fade-in">
           <div className="relative glass p-10 rounded-[40px] premium-shadow border-[var(--glass-border)] flex flex-col items-center w-full max-w-sm animate-scale-in">
              <div className="absolute -top-12 w-24 h-24 premium-gradient rounded-[32px] flex items-center justify-center shadow-2xl shadow-indigo-500/40 animate-bounce">
                {isVideoCall ? <Video className="w-12 h-12 text-white" /> : <PhoneCall className="w-12 h-12 text-white" />}
              </div>
              
              <div className="mt-12 text-center mb-10">
                <h2 className="text-sm font-black text-indigo-400 uppercase tracking-[0.2em] mb-2">Cuộc gọi {isVideoCall ? 'Video' : 'Thoại'}</h2>
                <p className="text-3xl font-black text-[var(--text-primary)] mb-1 tracking-tight">{callerName || 'Người lạ'}</p>
                <div className="flex items-center justify-center gap-2 text-[var(--text-secondary)] font-bold text-xs">
                   <Lock className="w-3.5 h-3.5 text-emerald-500" /> 
                   <span className="uppercase tracking-widest">Mã hóa đầu cuối</span>
                </div>
              </div>

              <div className="flex gap-4 w-full">
                 <button 
                  onClick={rejectCall} 
                  className="flex-1 py-4 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-2xl font-black transition-all duration-300 border border-red-500/20 active:scale-95"
                 >
                   Từ chối
                 </button>
                 <button 
                  onClick={answerCall} 
                  className="flex-1 py-4 premium-gradient text-white rounded-2xl font-black shadow-xl shadow-indigo-500/20 transition-all duration-300 hover:brightness-110 active:scale-95"
                 >
                   Chấp nhận
                 </button>
              </div>
           </div>
        </div>
      )}

      {/* --- Active Call Interface --- */}
      {isActiveCall && (
        <div className={`fixed z-[10000] transition-all duration-700 ease-out overflow-hidden shadow-2xl ${
          isMinimized 
            ? 'bottom-8 right-8 w-80 h-48 rounded-[32px] border-2 border-[var(--primary)] bg-slate-900 animate-scale-in group' 
            : 'inset-0 bg-[var(--bg-primary)] flex flex-col'
        }`}>
           {/* Background Decor (Only for Fullscreen) */}
           {!isMinimized && (
             <>
               <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-[120px] animate-pulse"></div>
               <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-[120px] animate-pulse [animation-delay:2s]"></div>
             </>
           )}

           {/* Toolbar (Only for Fullscreen) */}
           {!isMinimized && (
             <div className="absolute top-8 left-8 right-8 z-50 flex justify-between items-center animate-fade-in">
               <button 
                 onClick={() => setIsMinimized(true)}
                 className="px-5 py-3 glass rounded-2xl text-[var(--text-primary)] font-bold flex items-center gap-2 hover:bg-white/10 transition-all group/min"
               >
                 <X className="w-5 h-5 group-hover/min:rotate-90 transition-transform" />
                 <span className="text-xs uppercase tracking-widest">Thu nhỏ</span>
               </button>
               
               <div className="glass px-6 py-3 rounded-2xl flex items-center gap-3">
                 <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                 <span className="text-xs font-black text-[var(--text-primary)] uppercase tracking-widest">Live: {isVideoCall ? 'HD Video' : 'HQ Audio'}</span>
               </div>
             </div>
           )}

           {/* Hover Controls (Only for Minimized) */}
           {isMinimized && (
             <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-all duration-300">
               <div className="flex gap-4 transform translate-y-4 group-hover:translate-y-0 transition-transform">
                 <button onClick={() => setIsMinimized(false)} className="p-4 glass rounded-2xl text-white hover:bg-white/20 transition-all">
                    <Video className="w-6 h-6" />
                 </button>
                 <button onClick={leaveCall} className="p-4 bg-red-500 rounded-2xl text-white hover:bg-red-600 transition-all shadow-lg shadow-red-500/30">
                    <Phone className="w-6 h-6 rotate-[135deg]" />
                 </button>
               </div>
             </div>
           )}

           {/* Dialing State Overlay */}
           {isDialing && !isMinimized && (
               <div className="absolute inset-0 flex flex-col items-center justify-center z-40 bg-[var(--bg-primary)]/80 backdrop-blur-xl animate-fade-in">
                   <div className="relative mb-12">
                     <div className="w-32 h-32 border-4 border-indigo-500/20 rounded-full animate-ping"></div>
                     <div className="absolute inset-0 w-32 h-32 premium-gradient rounded-full flex items-center justify-center shadow-2xl shadow-indigo-500/40">
                        <PhoneCall className="w-12 h-12 text-white animate-pulse" />
                     </div>
                   </div>
                   <h3 className="text-3xl font-black text-[var(--text-primary)] mb-2 tracking-tight">Đang gọi...</h3>
                   <p className="text-indigo-400 font-black text-sm uppercase tracking-[0.3em]">{callerName || 'Người dùng'}</p>
               </div>
           )}
           
           {/* Video / Content Area */}
           <div className={`relative flex-1 flex items-center justify-center transition-all duration-500 ${isMinimized ? 'p-0' : 'p-10 pb-32'}`}>
              <div className={`relative w-full h-full glass rounded-[40px] overflow-hidden premium-shadow ${isMinimized ? 'border-0' : 'border border-[var(--glass-border)]'}`}>
                {isVideoCall ? (
                   <video playsInline ref={userVideo} autoPlay className="w-full h-full object-cover" />
                ) : (
                   <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 to-indigo-950">
                      <div className={`premium-gradient rounded-full flex items-center justify-center shadow-2xl ${isMinimized ? 'w-20 h-20' : 'w-48 h-48'}`}>
                         <Phone className={`${isMinimized ? 'w-8 h-8' : 'w-20 h-20'} text-white animate-pulse`} />
                      </div>
                      {!isMinimized && <p className="mt-8 text-2xl font-black text-white uppercase tracking-widest">{callerName || 'Voice Call'}</p>}
                   </div>
                )}
                
                {/* Self View (Picture in Picture) */}
                {isVideoCall && !isMinimized && (
                   <div className="absolute bottom-10 right-10 w-48 h-64 glass rounded-3xl overflow-hidden border-2 border-white/20 shadow-2xl z-30 transform hover:scale-110 transition-transform duration-500">
                      <video playsInline muted ref={myVideo} autoPlay className="w-full h-full object-cover" />
                   </div>
                )}
                
                {/* Audio elements */}
                <audio playsInline muted ref={myVideo} autoPlay className="hidden" />
                <audio playsInline ref={userVideo} autoPlay className="hidden" />
                
                {/* Minimized Overlay Info */}
                {isMinimized && (
                  <div className="absolute bottom-4 left-4 right-4 p-3 glass rounded-xl">
                    <p className="text-[10px] text-white font-black uppercase tracking-widest truncate">{callerName || 'Đang kết nối'}</p>
                  </div>
                )}
              </div>
           </div>

           {/* Bottom Control Bar (Fullscreen Only) */}
           {!isMinimized && (
             <div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-50 flex items-center gap-6 p-4 glass rounded-[32px] border border-[var(--glass-border)] shadow-2xl animate-slide-up">
                <button className="p-5 bg-white/5 hover:bg-white/10 rounded-2xl text-[var(--text-primary)] transition-all">
                  <Phone className="w-7 h-7 opacity-50" />
                </button>
                <button 
                   onClick={leaveCall} 
                   className="w-20 h-20 bg-red-500 rounded-[28px] flex items-center justify-center hover:bg-red-600 shadow-2xl shadow-red-500/40 transition-all hover:scale-110 active:scale-95"
                >
                   <Phone className="w-9 h-9 text-white rotate-[135deg]" />
                </button>
                <button className="p-5 bg-white/5 hover:bg-white/10 rounded-2xl text-[var(--text-primary)] transition-all">
                  <Video className="w-7 h-7 opacity-50" />
                </button>
             </div>
           )}
        </div>
      )}
    </CallContext.Provider>
  );
};
