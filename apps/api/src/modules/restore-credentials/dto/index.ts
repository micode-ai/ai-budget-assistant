import { IsObject, IsNotEmpty } from 'class-validator';
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from '@simplewebauthn/server';

export class VerifyRestoreRegistrationDto {
  @IsObject()
  @IsNotEmpty()
  response!: RegistrationResponseJSON;
}

export class VerifyRestoreAuthenticationDto {
  @IsObject()
  @IsNotEmpty()
  response!: AuthenticationResponseJSON;
}
