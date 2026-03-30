/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="es" dir="ltr">
    <Head>
      <meta charSet="utf-8" />
    </Head>
    <Preview>Tu código de verificación — TEKTRA</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Código de verificación</Heading>
        <Text style={text}>
          Usa el siguiente código para confirmar tu identidad:
        </Text>
        <Text style={codeStyle}>{token}</Text>
        <Text style={footer}>
          Este código caducará en breve. Si no lo has solicitado,
          ignora este mensaje.
        </Text>
        <Text style={brand}>
          TEKTRA &mdash; Dirección y Ejecución de Obra Profesional
        </Text>
      </Container>
    </Body>
  </Html>
)

export default ReauthenticationEmail

const main = { backgroundColor: '#ffffff', fontFamily: "'Montserrat', Arial, sans-serif" }
const container = { padding: '20px 25px' }
const h1 = {
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: '#000000',
  margin: '0 0 20px',
}
const text = {
  fontSize: '14px',
  color: '#55575d',
  lineHeight: '1.5',
  margin: '0 0 25px',
}
const codeStyle = {
  fontFamily: 'Courier, monospace',
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: '#000000',
  margin: '0 0 30px',
}
const footer = { fontSize: '12px', color: '#999999', margin: '30px 0 0' }
const brand = { fontSize: '10px', color: '#bbbbbb', margin: '10px 0 0', textAlign: 'center' as const }
