/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const InviteEmail = ({
  siteName,
  siteUrl,
  confirmationUrl,
}: InviteEmailProps) => (
  <Html lang="es" dir="ltr">
    <Head />
    <Preview>🏗️ Invitación al Proyecto de Obra - TEKTRA</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img
          src="https://tektra.es/tektra-icon-512.png"
          width="48"
          height="48"
          alt="TEKTRA"
          style={logo}
        />
        <Heading style={h1}>Invitación al Proyecto de Obra</Heading>
        <Text style={text}>Hola,</Text>
        <Text style={text}>
          Se te ha invitado a participar como agente en un proyecto de dirección
          de obra gestionado a través de <strong>TEKTRA</strong>.
        </Text>
        <Text style={text}>
          Desde esta plataforma centralizamos la dirección, ejecución, el libro
          de órdenes y las firmas digitales de forma segura para garantizar la
          trazabilidad legal de todos los agentes.
        </Text>
        <Text style={text}>
          Para acceder al panel de control y configurar tu acceso, pulsa en el
          siguiente botón:
        </Text>
        <Button style={button} href={confirmationUrl}>
          Confirmar Acceso a TEKTRA
        </Button>
        <Text style={footer}>
          TEKTRA — Dirección y Ejecución de Obra Profesional.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default InviteEmail

const main = { backgroundColor: '#ffffff', fontFamily: 'Montserrat, Arial, sans-serif' }
const container = { padding: '32px 28px' }
const logo = { margin: '0 0 24px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#262626', margin: '0 0 20px' }
const text = { fontSize: '14px', color: '#525252', lineHeight: '1.6', margin: '0 0 16px' }
const button = { backgroundColor: '#262626', color: '#fafafa', fontSize: '14px', fontWeight: '600' as const, borderRadius: '4px', padding: '12px 24px', textDecoration: 'none', margin: '8px 0 0' }
const footer = { fontSize: '12px', color: '#999999', margin: '32px 0 0', borderTop: '1px solid #e5e5e5', paddingTop: '16px' }
