import React from 'react';
import {webcrypto} from 'node:crypto';
import {describe,it,expect,beforeEach,afterEach,vi} from 'vitest';
import {render,screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {setAppLock,verifyAppLock,removeAppLock,appLockEnabled,appLockWait} from '../src/shared/lib/appLock.js';
import AppLockGate,{AppLockSettings} from '../src/shared/components/AppLock.jsx';

beforeEach(()=>{vi.stubGlobal('crypto',webcrypto);localStorage.clear();});
afterEach(()=>{vi.unstubAllGlobals();localStorage.clear();});

describe('app lock',()=>{
 it('stores only a salted derivation, rejects weak PINs and verifies the right one',async()=>{
  await expect(setAppLock('12')).rejects.toThrow('4~8자리');
  await expect(setAppLock('1111')).rejects.toThrow('반복');
  await expect(setAppLock('1234')).rejects.toThrow('연속');
  await setAppLock('2580');
  expect(appLockEnabled()).toBe(true);
  expect(localStorage.getItem('synex-app-lock-v1')).not.toContain('2580');
  expect(await verifyAppLock('2581')).toBe(false);
  expect(await verifyAppLock('2580')).toBe(true);
  expect(await removeAppLock('0000')).toBe(false);
  expect(await removeAppLock('2580')).toBe(true);
  expect(appLockEnabled()).toBe(false);
 });

 it('delays further attempts after five misses, even for the right PIN',async()=>{
  await setAppLock('2580');const now=1_000_000;
  for(let i=0;i<4;i++)expect(await verifyAppLock('0000',now)).toBe(false);
  expect(appLockWait(now)).toBe(0);
  expect(await verifyAppLock('0000',now)).toBe(false);
  expect(appLockWait(now)).toBe(30);
  expect(await verifyAppLock('2580',now+1000)).toBe(false);
  expect(await verifyAppLock('2580',now+31000)).toBe(true);
  expect(appLockWait(now+31000)).toBe(0);
 });

 it('hides the app until the PIN is entered and locks again after time in the background',async()=>{
  await setAppLock('2580');
  render(<AppLockGate><p>내 건강 기록</p></AppLockGate>);
  expect(screen.queryByText('내 건강 기록')).toBeNull();
  await userEvent.type(screen.getByLabelText('PIN'),'9999');
  await userEvent.click(screen.getByRole('button',{name:'잠금 해제'}));
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect(screen.queryByText('내 건강 기록')).toBeNull();
  await userEvent.type(screen.getByLabelText('PIN'),'2580');
  await userEvent.click(screen.getByRole('button',{name:'잠금 해제'}));
  expect(await screen.findByText('내 건강 기록')).toBeTruthy();
  const hidden=vi.spyOn(document,'hidden','get'),clock=vi.spyOn(Date,'now');
  clock.mockReturnValue(5_000_000);hidden.mockReturnValue(true);document.dispatchEvent(new Event('visibilitychange'));
  clock.mockReturnValue(5_000_000+61_000);hidden.mockReturnValue(false);document.dispatchEvent(new Event('visibilitychange'));
  await vi.waitFor(()=>expect(screen.queryByText('내 건강 기록')).toBeNull());
  hidden.mockRestore();clock.mockRestore();
 });

 it('renders children untouched when no lock is set and can be enabled from settings',async()=>{
  render(<AppLockGate><p>내 건강 기록</p></AppLockGate>);
  expect(screen.getByText('내 건강 기록')).toBeTruthy();
  render(<AppLockSettings/>);
  await userEvent.type(screen.getByLabelText('새 PIN (숫자 4~8자리)'),'2580');
  await userEvent.type(screen.getByLabelText('새 PIN 다시 입력'),'2581');
  await userEvent.click(screen.getByRole('button',{name:'앱 잠금 켜기'}));
  expect(await screen.findByText('두 PIN이 서로 달라요.')).toBeTruthy();
  expect(appLockEnabled()).toBe(false);
  await userEvent.type(screen.getByLabelText('새 PIN (숫자 4~8자리)'),'2580');
  await userEvent.type(screen.getByLabelText('새 PIN 다시 입력'),'2580');
  await userEvent.click(screen.getByRole('button',{name:'앱 잠금 켜기'}));
  expect(await screen.findByRole('button',{name:'앱 잠금 끄기'})).toBeTruthy();
  expect(appLockEnabled()).toBe(true);
 });
});
