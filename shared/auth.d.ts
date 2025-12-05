declare module '#auth-utils' {
  interface User {
    id: string
    email: string
    role: 'ADMIN' | 'MODERATOR' | 'USER'
  }
}

export {}
