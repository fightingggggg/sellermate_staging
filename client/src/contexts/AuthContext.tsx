import { createContext, useContext, useEffect, useState, useRef } from "react";
import {
  User as FirebaseUser,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithCustomToken,
  signOut,
  onAuthStateChanged,
  updatePassword,
  sendPasswordResetEmail,
  deleteUser,
  EmailAuthProvider,
  reauthenticateWithCredential,
  sendEmailVerification,
  updateEmail,
  signInWithCredential,
  GoogleAuthProvider,
  linkWithCredential,
} from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { User, UserProfile } from "@/types";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where, getDocs, onSnapshot, writeBatch } from "firebase/firestore";
import { CHROME_EXTENSION_ID } from "@/lib/constants";

interface AuthContextProps {
  currentUser: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  profileLoading: boolean;
  signUp: (
    email: string,
    password: string,
    name?: string,
    number?: string,
    birthDate?: string,
  ) => Promise<void>;
  signIn: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  updateUserProfile: (profileData: Partial<UserProfile>) => Promise<boolean>;
  fetchUserProfile: () => Promise<UserProfile | null>;
  updateUserEmail: (newEmail: string, password: string) => Promise<boolean>;
  updateUserPassword: (
    currentPassword: string,
    newPassword: string,
  ) => Promise<boolean>;
  deleteUserAccount: (deletionRefId?: string) => Promise<{ success: boolean; error?: string }>;
  sendPasswordReset: (email: string) => Promise<boolean>;
  verifyEmail: () => Promise<boolean>;
  error: string | null;
}

const AuthContext = createContext<AuthContextProps>({
  currentUser: null,
  userProfile: null,
  loading: true,
  profileLoading: false,
  signUp: async () => {}, // ageGroup은 선택적이므로 생략 가능
  signIn: async () => false,
  logout: async () => {},
  updateUserProfile: async () => false,
  fetchUserProfile: async () => null, // ✅ 이 줄이 누락되었음
  updateUserEmail: async () => false,
  updateUserPassword: async () => false,
  deleteUserAccount: async () => ({ success: false }),
  sendPasswordReset: async () => false,
  verifyEmail: async () => false,
  error: null,
});

export function useAuth() {
  return useContext(AuthContext);
}

const LOCAL_STORAGE_KEY = "lastUser";

const EXTENSION_IDS: string[] = [
  CHROME_EXTENSION_ID,
].filter(Boolean) as string[];

function sendMessageToAnyExtension(message: any): Promise<boolean> {
  return new Promise((resolve) => {
    const chromeAny: any = (typeof window !== "undefined" ? (window as any).chrome : undefined);
    if (!chromeAny || !chromeAny.runtime || typeof chromeAny.runtime.sendMessage !== "function") {
      console.warn("[ExtensionBridge] chrome.runtime.sendMessage unavailable");
      resolve(false);
      return;
    }
    if (EXTENSION_IDS.length === 0) {
      resolve(false);
      return;
    }
    let resolved = false;
    let pending = EXTENSION_IDS.length;
    EXTENSION_IDS.forEach((id) => {
      try {
        chromeAny.runtime.sendMessage(id, message, (resp: any) => {
          // lastError를 소비하여 경고 방지
          if (chromeAny.runtime && chromeAny.runtime.lastError) {
            void chromeAny.runtime.lastError.message;
          }
          pending -= 1;
          if (!resolved && resp && (resp.ok === true || resp.success === true)) {
            resolved = true;
            resolve(true);
          } else if (pending === 0 && !resolved) {
            resolve(false);
          }
        });
      } catch (e) {
        pending -= 1;
        if (pending === 0 && !resolved) resolve(false);
      }
    });
  });
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // localStorage에서 초기값을 불러옴
  const getInitialUser = () => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {}
      }
    }
    return null;
  };

  const [currentUser, setCurrentUser] = useState<User | null>(getInitialUser());
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 직전에 확장 프로그램에 전달한 로그인 키(이메일+멤버십)를 기억하여 중복 전송을 방지합니다.
  const lastSentLoginKeyRef = useRef<string | null>(null);
  const profileUnsubRef = useRef<()=>void>();

  // currentUser가 바뀔 때마다 localStorage에 저장
  useEffect(() => {
    if (typeof window !== "undefined") {
      if (currentUser) {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(currentUser));
      } else {
        localStorage.removeItem(LOCAL_STORAGE_KEY);
      }
    }
  }, [currentUser]);

  // 회원가입 함수
  async function signUp(
    email: string,
    password: string,
    name?: string,
    number?: string,
    birthDate?: string,
  ) {
    setError(null);
    try {
      // 최근 탈퇴한 계정(이메일/휴대폰) 재가입 제한 (30일)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const deletionsRef = collection(db, "accountDeletions");

      // 이메일로 최근 탈퇴 확인
      let recentDeletionFound = false;
      if (email) {
        const qEmail = query(deletionsRef, where("email", "==", email));
        const emailSnaps = await getDocs(qEmail);
        emailSnaps.forEach((d) => {
          const data = d.data() as any;
          const ts: any = data.timestamp;
          if (ts) {
            const deletedAt = ts.toDate ? ts.toDate() : new Date(ts);
            if (deletedAt > thirtyDaysAgo) {
              recentDeletionFound = true;
            }
          }
        });
      }

      // 휴대폰 번호로 최근 탈퇴 확인
      if (!recentDeletionFound && number) {
        const qPhone = query(deletionsRef, where("number", "==", number));
        const phoneSnaps = await getDocs(qPhone);
        phoneSnaps.forEach((d) => {
          const data = d.data() as any;
          const ts: any = data.timestamp;
          if (ts) {
            const deletedAt = ts.toDate ? ts.toDate() : new Date(ts);
            if (deletedAt > thirtyDaysAgo) {
              recentDeletionFound = true;
            }
          }
        });
      }

      if (recentDeletionFound) {
        const err: any = new Error("최근 탈퇴한 계정은 30일 이후에 재가입할 수 있습니다.");
        err.code = "auth/recent-account-deletion";
        throw err;
      }

      // 휴대폰 인증 후 이메일/비밀번호를 연결하는 경우에는 중복 체크 불필요
      const isPhoneOnlyUser = auth.currentUser &&
        auth.currentUser.providerData.length === 1 &&
        auth.currentUser.providerData[0].providerId === "phone";

      if (number && !isPhoneOnlyUser) {
        const usersRef = collection(db, "usersInfo");
        const q = query(usersRef, where("number", "==", number));
        const existing = await getDocs(q);
        if (!existing.empty && (existing.docs[0].id !== auth.currentUser?.uid)) {
          const err: any = new Error("이미 가입된 휴대폰 번호입니다.");
          err.code = "auth/phone-already-in-use";
          throw err;
        }
      }

      let user: FirebaseUser | null = null;

      // (1) 이미 휴대폰 인증으로 로그인된 사용자가 있는 경우 → 이메일/비밀번호 자격 증명 연결
      if (
        auth.currentUser &&
        auth.currentUser.providerData.some((p) => p.providerId === "phone")
      ) {
        const credential = EmailAuthProvider.credential(email, password);
        const linkResult = await linkWithCredential(auth.currentUser, credential);
        user = linkResult.user;
      } else {
        // (2) 일반 회원가입 (휴대폰 인증 없이 바로)
        const credential = await createUserWithEmailAndPassword(
          auth,
          email,
          password,
        );
        user = credential.user;
      }

      if (user) {
        try {
          // 사용자 정보 저장/업데이트
          const userProfile = {
            uid: user.uid,
            email: user.email,
            name: name || "", // store name
            number: number || "",
            birthDate: birthDate || "", // 생년월일 추가
            provider: "email",
            createdAt: new Date(),
            emailVerified: false,
          };

          await setDoc(doc(db, "usersInfo", user.uid), userProfile, {
            merge: true,
          });

          // 인증 이메일 발송
          try {
            await fetch("/api/send-verification-email", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ email }),
            });
          } catch (err) {
            console.error("Failed to request verification email", err);
          }

          // 로그아웃 (이메일 인증 후 재로그인 유도)
          await signOut(auth);
          setCurrentUser(null);
          setUserProfile(null);
          setError(
            "회원가입이 완료되었습니다! \n 이메일을 확인하여 인증을 완료해주세요.",
          );
        } catch (error) {
          console.error("Error creating user profile:", error);
          await signOut(auth);
          setCurrentUser(null);
          setUserProfile(null);
          setError(
            "회원가입이 완료되었습니다! 이메일을 확인하여 인증을 완료해주세요.",
          );
        }
      }
    } catch (error: any) {
      console.error("Error signing up", error);
      if (error.code === "auth/email-already-in-use") {
        setError(
          "이미 가입된 이메일입니다. 로그인을 시도하거나 비밀번호 찾기를 이용해주세요.",
        );
      } else if (error.code === "auth/invalid-email") {
        setError("올바른 이메일 형식이 아닙니다.");
      } else if (error.code === "auth/weak-password") {
        setError("비밀번호는 최소 6자 이상이어야 합니다.");
      } else if (error.code === "auth/recent-account-deletion") {
        setError("최근 탈퇴한 계정은 30일 이후에 재가입할 수 있습니다.");
      } else if (error.code === "auth/phone-already-in-use") {
        setError("이미 가입된 휴대폰 번호입니다.");
      } else if (error.code === "auth/credential-already-in-use") {
        setError("이미 다른 계정에 연결된 이메일입니다. 로그인 후 휴대폰을 연동하세요.");
      } else {
        setError("회원가입 중 오류가 발생했습니다.");
      }
      throw error;
    }
  }

  // 로그인 함수
  async function signIn(email: string, password: string): Promise<boolean> {
    setError(null);
    try {
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email,
        password,
      );

      if (!userCredential.user.emailVerified) {
        await signOut(auth);
        setError(
          "이메일 인증이 필요합니다. 이메일함을 확인하여 인증을 완료해주세요.",
        );
        return false;
      }
      await fetchUserProfile();
      return true;
    } catch (error: any) {
      console.error("Error signing in", error);
      if (error.code === "auth/invalid-email") {
        setError(
          "유효하지 않은 이메일 형식입니다. 이메일 주소를 다시 확인해 주세요.",
        );
      } else if (error.code === "auth/wrong-password") {
        setError("잘못된 비밀번호입니다.");
      } else if (error.code === "auth/invalid-credential") {
        setError("이메일 또는 비밀번호가 올바르지 않습니다.");
      } else if (error.code === "auth/user-not-found") {
        setError("등록되지 않은 이메일입니다. 회원가입을 먼저 진행해 주세요.");
      } else if (error.code === "auth/too-many-requests") {
        setError(
          "너무 많은 로그인 시도가 감지되었습니다. 보안을 위해 잠시 후 다시 시도해 주세요.",
        );
      } else {
        setError("로그인 중 오류가 발생했습니다.");
      }
      return false;
    }
  }

  // 로그아웃 함수
  async function logout() {
    setError(null);
    try {
      await signOut(auth);
      setUserProfile(null);
      // 확장 프로그램에 직접 로그아웃 전달 (postMessage 사용 금지)
      try {
        await sendMessageToAnyExtension({ type: "LOGOUT" });
      } catch {}
    } catch (error: any) {
      console.error("Error logging out", error);
      setError(error.message || "로그아웃 중 오류가 발생했습니다.");
    }
  }

  // 사용자 프로필 업데이트
  async function updateUserProfile(
    profileData: Partial<UserProfile>,
  ): Promise<boolean> {
    setError(null);
    if (!currentUser) {
      setError("로그인이 필요합니다.");
      return false;
    }

    try {
      // usersInfo 컬렉션 사용
      const userDocRef = doc(db, "usersInfo", currentUser.uid);

      // 해당 문서가 존재하는지 확인
      const docSnap = await getDoc(userDocRef);

      if (docSnap.exists()) {
        // 문서가 있으면 업데이트
        await updateDoc(userDocRef, profileData);
      } else {
        // 문서가 없으면 새로 생성
        await setDoc(userDocRef, {
          uid: currentUser.uid,
          email: currentUser.email,
          ...profileData,
          createdAt: new Date().toISOString(),
          emailVerified: auth.currentUser?.emailVerified || false,
        });
      }

      // 상태 업데이트
      setUserProfile((prev) => (prev ? { ...prev, ...profileData } : null));
      return true;
    } catch (error: any) {
      console.error("Error updating profile", error);
      setError(error.message || "프로필 업데이트 중 오류가 발생했습니다.");
      return false;
    }
  }

    // 사용자 프로필 가져오기
async function fetchUserProfile(): Promise<UserProfile | null> {
  setError(null);
  if (!currentUser) {
    setError("로그인이 필요합니다.");
    return null;
  }

  try {
    const userDocRef = doc(db, "usersInfo", currentUser.uid);
    const docSnap = await getDoc(userDocRef);

    if (docSnap.exists()) {
      const userData = docSnap.data() as UserProfile;
      setUserProfile(userData);
      return userData;
    } else {
      setError("사용자 프로필이 존재하지 않습니다.");
      return null;
    }
  } catch (error: any) {
    console.error("Error fetching profile", error);
    setError(error.message || "프로필 불러오기 중 오류가 발생했습니다.");
    return null;
  }
}

  // 이메일 업데이트
  async function updateUserEmail(
    newEmail: string,
    password: string,
  ): Promise<boolean> {
    setError(null);
    if (!auth.currentUser || !currentUser) {
      setError("로그인이 필요합니다.");
      return false;
    }

    try {
      // 사용자 재인증
      const credential = EmailAuthProvider.credential(
        currentUser.email || "",
        password,
      );
      await reauthenticateWithCredential(auth.currentUser, credential);

      // 이메일 업데이트
      await updateEmail(auth.currentUser, newEmail);

      // 이메일 인증 재발송
      await sendEmailVerification(auth.currentUser);

      // 프로필 업데이트
      setCurrentUser((prev) => (prev ? { ...prev, email: newEmail } : null));
      setUserProfile((prev) => (prev ? { ...prev, email: newEmail } : null));

      return true;
    } catch (error: any) {
      console.error("Error updating email", error);
      setError(error.message || "이메일 업데이트 중 오류가 발생했습니다.");
      return false;
    }
  }

  // 비밀번호 업데이트
  async function updateUserPassword(
    currentPassword: string,
    newPassword: string,
  ): Promise<boolean> {
    setError(null);
    if (!auth.currentUser || !currentUser) {
      setError("로그인이 필요합니다.");
      return false;
    }

    try {
      // 사용자 재인증
      const credential = EmailAuthProvider.credential(
        currentUser.email || "",
        currentPassword,
      );
      await reauthenticateWithCredential(auth.currentUser, credential);

      // 비밀번호 업데이트
      await updatePassword(auth.currentUser, newPassword);
      return true;
    } catch (error: any) {
      console.error("Error updating password", error);
      setError(error.message || "비밀번호 업데이트 중 오류가 발생했습니다.");
      return false;
    }
  }

  //탈퇴
  async function deleteUserAccount(deletionRefId?: string, password?: string): Promise<{ success: boolean; error?: string }> {
    setError(null);
    if (!auth.currentUser || !currentUser) {
      const errorMsg = "로그인이 필요합니다.";
      setError(errorMsg);
      return { success: false, error: errorMsg };
    }

    // Firebase Auth 삭제 전에 uid를 저장
    const userUid = currentUser.uid;
    const socialProvider = (userProfile as any)?.provider;
    // 삭제 전에 ID 토큰을 미리 확보 (삭제 후에는 currentUser가 없어짐)
    let preDeleteIdToken: string | null = null;
    try {
      preDeleteIdToken = await auth.currentUser.getIdToken();
    } catch {}

    try {
      // 이메일/비밀번호 로그인 사용자가 비밀번호를 입력한 경우에만 재인증을 수행합니다.
      if (password) {
        const credential = EmailAuthProvider.credential(
          currentUser.email || "",
          password,
        );
        await reauthenticateWithCredential(auth.currentUser, credential);
      }

      // 1. Firestore에서 사용자 정보 삭제
      let userInfoDeleted = false;
      let originalUserData: any = null;
      
      try {
        console.log("[FIRESTORE-DELETE] Attempting to delete userInfo for uid:", userUid);
        
        // 삭제 전에 사용자 데이터 백업
        const userDocRef = doc(db, "usersInfo", userUid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          originalUserData = userDocSnap.data();
        }
        
        await deleteDoc(userDocRef);
        console.log("[FIRESTORE-DELETE] Successfully deleted userInfo for uid:", userUid);
        userInfoDeleted = true;
      } catch (firestoreError) {
        console.error("[FIRESTORE-DELETE] Error deleting userInfo:", firestoreError);
        // Firestore 삭제 실패는 무시하고 계속 진행
      }

      // 2. Firebase Auth에서 사용자 삭제
      try {
        await deleteUser(auth.currentUser);
        console.log("[AUTH-DELETE] Successfully deleted Firebase Auth user for uid:", userUid);
        
        // 3. 소셜 계정 연결 해제 (Firebase Auth 삭제 성공 시에만 수행)
        try {
          if (socialProvider === "naver") {
            await fetch("/api/auth/naver/unlink", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(preDeleteIdToken ? { Authorization: `Bearer ${preDeleteIdToken}` } : {}),
              },
              body: JSON.stringify({ uid: userUid }),
            });
            console.log("[SOCIAL-UNLINK] Successfully unlinked Naver account");
          } else if (socialProvider === "kakao") {
            await fetch("/api/auth/kakao/unlink", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(preDeleteIdToken ? { Authorization: `Bearer ${preDeleteIdToken}` } : {}),
              },
              body: JSON.stringify({ uid: userUid }),
            });
            console.log("[SOCIAL-UNLINK] Successfully unlinked Kakao account");
          }
        } catch (unlinkErr) {
          console.warn("[SOCIAL-UNLINK] warning", unlinkErr);
        }
        
        // 4. socialTokens 문서 삭제 (Firebase Auth 삭제 성공 시에만 수행)
        try {
          const idTokenForServer = preDeleteIdToken;
          await fetch('/api/auth/social-tokens/delete', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(idTokenForServer ? { Authorization: `Bearer ${idTokenForServer}` } : {}),
            },
            body: JSON.stringify({ uid: userUid }),
          });
          console.log('[SERVER-DELETE] Requested socialTokens delete for uid:', userUid);
        } catch (socialTokensErr) {
          console.warn('[SERVER-DELETE] socialTokens server delete failed (ignored):', socialTokensErr);
        }
        
      } catch (authError) {
        console.error("[AUTH-DELETE] Error deleting Firebase Auth user:", authError);
        
        // Firebase Auth 삭제 실패 시 Firestore 사용자 정보 복원
        if (userInfoDeleted && originalUserData) {
          try {
            console.log("[FIRESTORE-RESTORE] Attempting to restore userInfo for uid:", userUid);
            await setDoc(doc(db, "usersInfo", userUid), originalUserData);
            console.log("[FIRESTORE-RESTORE] Successfully restored userInfo for uid:", userUid);
          } catch (restoreError) {
            console.error("[FIRESTORE-RESTORE] Error restoring userInfo:", restoreError);
          }
        }
        
        // Firebase Auth 삭제 실패 시 저장된 탈퇴 사유도 삭제
        if (deletionRefId) {
          try {
            console.log("[DELETION-REASON-DELETE] Attempting to delete accountDeletions for refId:", deletionRefId);
            await deleteDoc(doc(db, "accountDeletions", deletionRefId));
            console.log("[DELETION-REASON-DELETE] Successfully deleted accountDeletions for refId:", deletionRefId);
          } catch (deletionError) {
            console.error("[DELETION-REASON-DELETE] Error deleting accountDeletions:", deletionError);
          }
        }
        
        // Firebase Auth 오류를 다시 throw하여 상위에서 처리
        throw authError;
      }

      // (소셜 언링크 및 socialTokens 삭제는 Firebase Auth 삭제 성공 시에만 수행됨)

      setCurrentUser(null);
      setUserProfile(null);
      return { success: true };
    } catch (error: any) {
      console.error("Error deleting account", error);

      let errorMessage = "회원 탈퇴 중 오류가 발생했습니다.";
      
      switch (error.code) {
        case "auth/wrong-password":
          errorMessage = "비밀번호가 올바르지 않습니다. 다시 입력해 주세요.";
          break;
        case "auth/too-many-requests":
          errorMessage = "너무 많은 시도가 감지되었습니다. 보안을 위해 잠시 후 다시 시도해 주세요.";
          break;
        case "auth/requires-recent-login":
          errorMessage = "보안을 위해 최근 로그인한 사용자만 탈퇴할 수 있습니다. 로그아웃 후 다시 로그인해 주세요.";
          break;
        case "auth/invalid-credential":
          errorMessage = "이메일 또는 비밀번호가 올바르지 않습니다.";
          break;
        default:
          errorMessage = error.message || "회원 탈퇴 중 오류가 발생했습니다.";
          break;
      }

      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  // 비밀번호 재설정 이메일 발송
  async function sendPasswordReset(email: string): Promise<boolean> {
    setError(null);
    try {
      await sendPasswordResetEmail(auth, email);
      return true;
    } catch (error: any) {
      console.error("Error sending password reset", error);
      setError(
        error.message || "비밀번호 재설정 이메일 발송 중 오류가 발생했습니다.",
      );
      return false;
    }
  }

  // 이메일 인증 발송
  async function verifyEmail(): Promise<boolean> {
    setError(null);
    if (!auth.currentUser) {
      setError("로그인이 필요합니다.");
      return false;
    }

    try {
      await sendEmailVerification(auth.currentUser, {
        url: window.location.origin + "/login",
        handleCodeInApp: true,
      });
      return true;
    } catch (error: any) {
      console.error("Error sending verification email", error);
      setError(error.message || "이메일 인증 발송 중 오류가 발생했습니다.");
      return false;
    }
  }

  // 인증 상태 변경 감지
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // 로그인 상태가 확인되면 이전 오류 메시지를 초기화합니다.
        setError(null);
        // 사용자 계정에 이메일 정보가 없는(소셜 간편가입 등) 경우 providerData에서 이메일을 찾아 사용
        const userData: User = {
          uid: user.uid,
          email: user.email ?? user.providerData.find(p => p.email)?.email ?? user.uid,
          displayName: user.displayName,
          photoURL: user.photoURL,
        };
        setCurrentUser(userData);
  
        try {
          // Firestore 실시간 구독으로 프로필 동기화
          profileUnsubRef.current?.(); // 이전 구독 해제
          const userDocRef = doc(db, "usersInfo", user.uid);
          profileUnsubRef.current = onSnapshot(userDocRef, (snap) => {
            if (snap.exists()) {
              setUserProfile(snap.data() as UserProfile);
            } else {
              setUserProfile(null);
            }
          });


        } catch (error) {
          console.error("자동 프로필 불러오기 실패:", error);
        }

        // ===== 확장 프로그램과의 통신 최적화 =====
        // 1) 로그인 상태 변화(신규 토큰)에 한해서만 메시지를 전송합니다.
        // 2) 이미 동일 토큰을 전달했다면 중복 전송을 방지합니다.
        if (typeof window !== "undefined" && user) {
          try {
            // 멤버십 타입 조회 (실패 시 기본 basic)
            let membershipType: 'basic' | 'booster' = 'basic';
            try {
              const tokenForMembership = await user.getIdToken();
              const resp = await fetch(`/api/membership/type/${user.uid}`, {
                headers: { Authorization: `Bearer ${tokenForMembership}` }
              });
              if (resp.ok) {
                const data = await resp.json();
                membershipType = data?.data?.membershipType === 'booster' ? 'booster' : 'basic';
              }
            } catch (e) {
              console.warn('[AuthContext] 멤버십 조회 실패, basic으로 진행');
            }

            // 이메일이 없을 수 있어 phoneNumber 또는 uid로 대체
            const identifier = (user.email ?? user.phoneNumber ?? user.uid) || '';

            // 이메일+멤버십 조합으로 중복 전송 방지 → 식별자(email||phone||uid)+멤버십
            const loginKey = `${identifier}|${membershipType}`;
            if (loginKey !== lastSentLoginKeyRef.current) {
              // 확장 프로그램으로 직접 전달 (postMessage 사용 금지)
              try {
                await sendMessageToAnyExtension({
                  type: "SET_LOGIN_STATUS",
                  email: user.email || null,
                  phoneNumber: user.phoneNumber || (userProfile as any)?.number || null,
                  uid: user.uid,
                  membershipType,
                  ts: Date.now(),
                });
              } catch {}

              lastSentLoginKeyRef.current = loginKey;
            }
          } catch (err) {
            console.error("토큰 가져오기 실패", err);
          }
        }
      } else {
        setCurrentUser(null);
        setUserProfile(null);

        // 프로필 리스너 해제
        profileUnsubRef.current?.();
        profileUnsubRef.current = undefined;

        // 이전에 로그인 상태였던 경우에만 로그아웃 메시지를 1회 전송합니다.
        if (typeof window !== "undefined" && lastSentLoginKeyRef.current !== null) {
          try {
            await sendMessageToAnyExtension({ type: "LOGOUT", ts: Date.now() });
          } catch {}
          lastSentLoginKeyRef.current = null;
        }
      }
      setLoading(false);
    });
  
    return unsubscribe;
  }, []);
  

  const value = {
    currentUser,
    userProfile,
    loading,
    profileLoading,
    signUp,
    signIn,
    logout,
    updateUserProfile,
    fetchUserProfile,
    updateUserEmail,
    updateUserPassword,
    deleteUserAccount,
    sendPasswordReset,
    verifyEmail,
    error,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}