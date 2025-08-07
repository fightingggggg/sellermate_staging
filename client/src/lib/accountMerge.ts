import { auth } from './firebase';
import { signInWithCustomToken } from 'firebase/auth';

export interface AccountMergeRequest {
  emailAccountUid: string;
  socialProvider: 'naver' | 'kakao';
  socialUid: string;
  email: string;
  password: string;
}

export interface AccountMergeResponse {
  success: boolean;
  message: string;
  customToken?: string;
  socialUid?: string;
  mergedData?: {
    email: string;
    name: string;
    provider: string;
  };
}

export class AccountMergeService {
  /**
   * 이메일 계정과 소셜 계정을 병합합니다.
   */
  static async mergeAccounts(request: AccountMergeRequest): Promise<AccountMergeResponse> {
    try {
      const response = await fetch('/api/auth/merge-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || '계정 병합에 실패했습니다.');
      }

      return data;
    } catch (error: any) {
      console.error('Account merge error:', error);
      throw new Error(error.message || '계정 병합 중 오류가 발생했습니다.');
    }
  }

  /**
   * 소셜 계정으로 로그인합니다.
   */
  static async signInWithSocialAccount(customToken: string): Promise<void> {
    try {
      await signInWithCustomToken(auth, customToken);
    } catch (error: any) {
      console.error('Social account sign in error:', error);
      throw new Error('소셜 계정 로그인에 실패했습니다.');
    }
  }

  /**
   * URL 파라미터에서 계정 병합 정보를 추출합니다.
   */
  static extractMergeInfoFromUrl(): {
    shouldMerge: boolean;
    emailAccountUid?: string;
    email?: string;
    password?: string;
  } {
    const urlParams = new URLSearchParams(window.location.search);
    const shouldMerge = urlParams.get('merge') === 'true';
    const emailAccountUid = urlParams.get('emailUid') || undefined;
    const email = urlParams.get('email') || undefined;
    const password = urlParams.get('password') || undefined;

    return {
      shouldMerge,
      emailAccountUid,
      email,
      password,
    };
  }

  /**
   * 계정 병합 후 URL을 정리합니다.
   */
  static cleanMergeParamsFromUrl(): void {
    const url = new URL(window.location.href);
    url.searchParams.delete('merge');
    url.searchParams.delete('emailUid');
    url.searchParams.delete('email');
    url.searchParams.delete('password');
    window.history.replaceState({}, '', url.toString());
  }
} 