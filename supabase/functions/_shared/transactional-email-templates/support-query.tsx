/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Html, Head, Body, Container, Section, Heading, Text, Hr } from 'npm:@react-email/components@0.0.22'

interface SupportQueryProps {
  userName?: string
  userEmail?: string
  userRole?: string
  message?: string
}

export const SupportQueryEmail = ({ userName = 'Usuario', userEmail = '', userRole = '', message = '' }: SupportQueryProps) => (
  <Html lang="es">
    <Head />
    <Body style={{ backgroundColor: '#f5f5f4', fontFamily: 'Arial, sans-serif', margin: 0, padding: 0 }}>
      <Container style={{ maxWidth: '560px', margin: '40px auto', backgroundColor: '#ffffff', borderRadius: '8px', overflow: 'hidden' }}>
        <Section style={{ backgroundColor: '#1a1a1a', padding: '24px 32px' }}>
          <Heading as="h1" style={{ color: '#ffffff', fontSize: '18px', margin: 0 }}>
            TEKTRA — Consulta de Soporte
          </Heading>
        </Section>
        <Section style={{ padding: '32px' }}>
          <Text style={{ fontSize: '14px', color: '#333', margin: '0 0 8px' }}>
            <strong>Usuario:</strong> {userName}
          </Text>
          <Text style={{ fontSize: '14px', color: '#333', margin: '0 0 8px' }}>
            <strong>Email:</strong> {userEmail}
          </Text>
          <Text style={{ fontSize: '14px', color: '#333', margin: '0 0 16px' }}>
            <strong>Rol:</strong> {userRole}
          </Text>
          <Hr style={{ borderColor: '#e5e5e5', margin: '16px 0' }} />
          <Text style={{ fontSize: '14px', color: '#333', whiteSpace: 'pre-wrap' }}>
            {message}
          </Text>
        </Section>
        <Section style={{ padding: '16px 32px', backgroundColor: '#fafaf9' }}>
          <Text style={{ fontSize: '11px', color: '#999', textAlign: 'center' as const }}>
            TEKTRA : gestión integral de obra
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: SupportQueryEmail,
  subject: (data: Record<string, any>) => `Consulta de soporte — ${data.userName || 'Usuario'}`,
  to: 'info@tektra.es',
  displayName: 'Consulta de Soporte',
  previewData: {
    userName: 'Juan Pérez',
    userEmail: 'juan@ejemplo.com',
    userRole: 'DEM',
    message: '¿Cómo puedo subir una certificación al módulo de economía?',
  },
}
