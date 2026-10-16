import type { CanActivate} from "@nestjs/common";
import { Injectable } from "@nestjs/common";

// TODO(spec): cookie+CSRF (web) and bearer JWT (mobile) auth.
@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(): boolean {
    return true;
  }
}
