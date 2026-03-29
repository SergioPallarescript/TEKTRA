/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="es" dir="ltr">
    <Head />
    <Preview>Tu código de verificación de TEKTRA</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src="https://tektra.es/tektra-icon-512.png" width="48" height="48" alt="TEKTRA" style={logo} />
        <Heading style={h1}>Código de verificación</Heading>
        <Text style={text}>Usa el siguiente código para confirmar tu identidad:</Text>
        <Text style={codeStyle}>{token}</Text>
        <Text style={footer}>
          Este código expirará en breve. Si no lo solicitaste, ignora este correo.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default ReauthenticationEmail

const main = { backgroundColor: '#ffffff', fontFamily: 'Montserrat, Arial, sans-serif' }
const container = { padding: '32px 28px' }
const logo = { margin: '0 0 24px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#262626', margin: '0 0 20px' }
const text = { fontSize: '14px', color: '#525252', lineHeight: '1.6', margin: '0 0 16px' }
const codeStyle = { fontFamily: 'Courier, monospace', fontSize: '28px', fontWeight: 'bold' as const, color: '#262626', margin: '0 0 30px', letterSpacing: '4px' }
const footer = { fontSize: '12px', color: '#999999', margin: '32px 0 0', borderTop: '1px solid #e5e5e5', paddingTop: '16px' }
